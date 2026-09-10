#!/usr/bin/env node
/**
 * Aggregatore delle posizioni degli autobus della rete TPL FVG.
 *
 * Perché serve
 * ------------
 * Il servizio pubblico restituisce le corse monitorate a UNA fermata per volta.
 * Per coprire la rete regionale occorrono centinaia di richieste, distribuite
 * nel tempo e deduplicate. Farlo dal browser di ogni visitatore significa
 * moltiplicare quel carico per ogni scheda aperta. Questo programma esegue le
 * richieste una volta sola, tiene i risultati in memoria e li offre alla
 * pagina in una sola risposta.
 *
 * Non richiede alcuna libreria esterna: soltanto Node.js.
 *   node aggregatore_tplfvg.js
 * poi si apre  http://127.0.0.1:8080/
 */

"use strict";
const http  = require("http");
const https = require("https");
const fs    = require("fs");
const path  = require("path");

/* ----------------------------- configurazione ---------------------------- */
const CONF = {
  porta:            Number(process.env.PORTA || 8080),
  intervalloMs:     Number(process.env.INTERVALLO_MS || 30000),
  richiestePerGiro: Number(process.env.RICHIESTE_PER_GIRO || 90),
  quotaPrioritarie: Number(process.env.QUOTA_PRIORITARIE || 0.6),  // parte del giro dedicata ai nodi principali
  parallele:        Number(process.env.PARALLELE || 6),
  timeoutMs:        Number(process.env.TIMEOUT_MS || 12000),
  scadenzaMs:       Number(process.env.SCADENZA_MS || 300000),
  pausaFraRichieste:Number(process.env.PAUSA_MS || 120),
  fermateFile:     process.env.FERMATE_FILE || null
};

const BASE_TEMPO_REALE = "https://realtime.tplfvg.it/API/v1.0/polemonitor/mrcruns";
const BASE_FERMATE     = "https://tplfvg.it/services/geojson/points/";
const RIQUADRO = { latMin: 45.30, latMax: 47.00, lonMin: 12.00, lonMax: 14.10 };

/* -------------------------------- stato ---------------------------------- */
const flotta = new Map();          // identificativo -> { corsa, ricevuto }
let fermateP1 = [], fermateP2 = [];
let cursoreP1 = 0, cursoreP2 = 0;
let giri = 0, ultimoGiro = null, ultimoErrore = null;
let lette = new Set();
let richiesteTotali = 0, erroriTotali = 0;

/* ------------------------------- richieste -------------------------------- */
function preleva(url, timeoutMs) {
  return new Promise((risolvi, rifiuta) => {
    const req = https.get(url, {
      headers: { "Accept": "application/json", "User-Agent": "aggregatore-tplfvg/1.0" }
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return rifiuta(new Error("risposta " + res.statusCode));
      }
      let corpo = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { corpo += c; });
      res.on("end", () => {
        try { risolvi(JSON.parse(corpo)); }
        catch (e) { rifiuta(new Error("risposta non leggibile come JSON")); }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("tempo scaduto")));
    req.on("error", rifiuta);
  });
}

/* -------------------- piano di interrogazione delle fermate --------------- */
const CHIAVE = /stazione|autostazione|interporto|aeroporto|terminal|capolinea/i;

async function preparaFermate() {
  // Con FERMATE_FILE si legge il catalogo da un file già scaricato,
  // utile quando la rete non è disponibile all'avvio.
  const geo = CONF.fermateFile
    ? JSON.parse(fs.readFileSync(CONF.fermateFile, "utf8"))
    : await preleva(BASE_FERMATE, 30000);
  const grezze = [];
  for (const f of geo.features) {
    const p = f.properties || {};
    if (p.__type !== "stop") continue;                 // le rivendite non servono
    const servizi = p.services || [];
    const maschera = (servizi.includes("urban") ? 1 : 0) | (servizi.includes("extraurban") ? 2 : 0);
    if (!maschera) continue;
    const c = f.geometry.coordinates;
    grezze.push({ codice: p.code, nome: p.name || "", luogo: p.location || "",
                  lat: c[1], lon: c[0], maschera });
  }

  const scelte = new Map();
  const metti = (s, pri) => {
    const o = scelte.get(s.codice);
    if (!o || pri < o.pri) scelte.set(s.codice, Object.assign({}, s, { pri }));
  };

  // Priorità 1: i nodi di scambio, riconosciuti dal nome della fermata.
  for (const s of grezze) if (CHIAVE.test(s.nome)) metti(s, 1);

  // Priorità 1: le tre fermate più centrali delle venticinque località maggiori.
  const perLuogo = new Map();
  for (const s of grezze) {
    if (!s.luogo) continue;
    if (!perLuogo.has(s.luogo)) perLuogo.set(s.luogo, []);
    perLuogo.get(s.luogo).push(s);
  }
  [...perLuogo.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 25).forEach(([, ss]) => {
    const la = ss.reduce((t, s) => t + s.lat, 0) / ss.length;
    const lo = ss.reduce((t, s) => t + s.lon, 0) / ss.length;
    ss.slice().sort((a, b) =>
      ((a.lat - la) ** 2 + (a.lon - lo) ** 2) - ((b.lat - la) ** 2 + (b.lon - lo) ** 2)
    ).slice(0, 3).forEach(s => metti(s, 1));
  });

  // Priorità 2: una fermata per cella di circa quattro chilometri, così la
  // copertura si distende su tutta la regione e non solo sulle città.
  const P = 0.04, celle = new Map();
  for (const s of grezze) {
    const k = Math.round(s.lat / P) + ":" + Math.round(s.lon / P) + ":" + s.maschera;
    const o = celle.get(k);
    if (!o || s.nome < o.nome) celle.set(k, s);
  }
  for (const s of celle.values()) metti(s, 2);

  const tutte = [...scelte.values()];
  fermateP1 = tutte.filter(s => s.pri === 1);
  fermateP2 = tutte.filter(s => s.pri === 2);
  console.log("Catalogo ufficiale: " + grezze.length + " fermate con servizio su gomma.");
  console.log("Piano di interrogazione: " + fermateP1.length + " nodi principali, " +
              fermateP2.length + " fermate di copertura territoriale.");
  const giroCompleto = tutte.reduce((t, s) => t + (s.maschera === 3 ? 2 : 1), 0);
  console.log("Un giro completo della rete richiede " + giroCompleto + " richieste; " +
              "se ne eseguono " + CONF.richiestePerGiro + " ogni " + (CONF.intervalloMs / 1000) + " secondi.");
}

/* --------------------------- lettura di una fermata ----------------------- */
function corseDi(risposta) {
  if (Array.isArray(risposta)) return risposta;
  if (risposta && Array.isArray(risposta.Runs)) return risposta.Runs;
  if (risposta && Array.isArray(risposta.runs)) return risposta.runs;
  return [];
}

function posizioneValida(c) {
  const lat = parseFloat(String(c.Latitude).replace(",", "."));
  const lon = parseFloat(String(c.Longitude).replace(",", "."));
  if (!isFinite(lat) || !isFinite(lon) || lat === 0 || lon === 0) return false;
  return lat >= RIQUADRO.latMin && lat <= RIQUADRO.latMax
      && lon >= RIQUADRO.lonMin && lon <= RIQUADRO.lonMax;
}

async function interroga(codice, urbano) {
  const url = BASE_TEMPO_REALE + "?StopCode=" + encodeURIComponent(codice) + "&IsUrban=" + (urbano ? "true" : "false");
  richiesteTotali++;
  const risposta = await preleva(url, CONF.timeoutMs);
  const adesso = Date.now();
  let presi = 0;
  for (const c of corseDi(risposta)) {
    if (!c || typeof c !== "object") continue;
    if (c.IsStarted === false || c.IsStarted === "false" || c.IsStarted === 0) continue;
    if (!posizioneValida(c)) continue;
    // Lo stesso mezzo compare nelle risposte di più fermate: vince la lettura più recente.
    const id = c.Vehicle ? "v:" + c.Vehicle
             : "c:" + (c.LineCode || "") + "|" + (c.Race || "") + "|" + c.Latitude + "," + c.Longitude;
    const vecchio = flotta.get(id);
    if (!vecchio || vecchio.ricevuto <= adesso) {
      flotta.set(id, { corsa: c, ricevuto: adesso });
      presi++;
    }
  }
  lette.add(codice);
  return presi;
}

/* ------------------------------ ciclo di lavoro --------------------------- */
function prendi(elenco, cursore, quante) {
  const fuori = [];
  for (let i = 0; i < quante && i < elenco.length; i++) fuori.push(elenco[(cursore + i) % elenco.length]);
  return fuori;
}

async function giro() {
  const quotaP1 = Math.max(1, Math.round(CONF.richiestePerGiro * CONF.quotaPrioritarie));
  const quotaP2 = Math.max(0, CONF.richiestePerGiro - quotaP1);

  const compiti = [];
  const accoda = (fermate) => {
    for (const f of fermate) {
      if (f.maschera & 1) compiti.push([f.codice, true]);
      if (f.maschera & 2) compiti.push([f.codice, false]);
    }
  };
  // Si prendono meno fermate delle richieste, perché una fermata mista ne vale due.
  accoda(prendi(fermateP1, cursoreP1, Math.ceil(quotaP1 / 1.2)));
  accoda(prendi(fermateP2, cursoreP2, Math.ceil(quotaP2 / 1.2)));
  const daFare = compiti.slice(0, CONF.richiestePerGiro);

  cursoreP1 = fermateP1.length ? (cursoreP1 + Math.ceil(quotaP1 / 1.2)) % fermateP1.length : 0;
  cursoreP2 = fermateP2.length ? (cursoreP2 + Math.ceil(quotaP2 / 1.2)) % fermateP2.length : 0;

  let errori = 0, nuove = 0;
  for (let i = 0; i < daFare.length; i += CONF.parallele) {
    const parte = daFare.slice(i, i + CONF.parallele);
    await Promise.all(parte.map(async ([codice, urbano]) => {
      try { nuove += await interroga(codice, urbano); }
      catch (e) { errori++; erroriTotali++; ultimoErrore = codice + ": " + e.message; }
    }));
    if (CONF.pausaFraRichieste) await new Promise(r => setTimeout(r, CONF.pausaFraRichieste));
  }

  // Si tolgono i mezzi non più rilevati da troppo tempo.
  const limite = Date.now() - CONF.scadenzaMs;
  for (const [id, v] of flotta) if (v.ricevuto < limite) flotta.delete(id);

  giri++;
  ultimoGiro = Date.now();
  console.log(new Date().toLocaleTimeString("it-IT") +
    "  giro " + giri + ": richieste " + daFare.length + ", errori " + errori +
    ", mezzi in memoria " + flotta.size + ", fermate viste " + lette.size);
  if (errori === daFare.length && daFare.length > 0) {
    console.warn("  nessuna richiesta ha risposto. Ultimo errore: " + ultimoErrore);
  }
}

/* ------------------------------ servizio web ------------------------------ */
function stato() {
  return {
    aggiornato: ultimoGiro ? new Date(ultimoGiro).toISOString() : null,
    giri,
    copertura: {
      modo: "aggregatore",
      fermateTotali: fermateP1.length + fermateP2.length,
      fermateLette: lette.size,
      nodiPrincipali: fermateP1.length,
      fermateTerritoriali: fermateP2.length,
      richiesteEseguite: richiesteTotali,
      erroriTotali,
      parziale: lette.size < (fermateP1.length + fermateP2.length)
    },
    ultimoErrore
  };
}

const server = http.createServer((req, res) => {
  const percorso = req.url.split("?")[0];
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (percorso === "/api/mezzi") {
    const corpo = JSON.stringify(Object.assign(stato(), {
      mezzi: [...flotta.values()].map(v => Object.assign({}, v.corsa, { __ricevuto: new Date(v.ricevuto).toISOString() }))
    }));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(corpo);
  }
  if (percorso === "/api/stato") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify(stato(), null, 2));
  }
  if (percorso === "/" || percorso === "/autobus_fvg.html") {
    const file = path.join(__dirname, "autobus_fvg.html");
    return fs.readFile(file, (e, dati) => {
      if (e) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
               return res.end("File autobus_fvg.html non trovato accanto all'aggregatore."); }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(dati);
    });
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Non trovato");
});

/* --------------------------------- avvio ---------------------------------- */
(async function avvio() {
  console.log("Aggregatore delle posizioni TPL FVG");
  try {
    await preparaFermate();
  } catch (e) {
    console.error("Catalogo delle fermate non raggiungibile: " + e.message);
    console.error("L'aggregatore resta in ascolto e riproverà al primo giro utile.");
  }
  server.listen(CONF.porta, "127.0.0.1", () => {
    console.log("In ascolto su http://127.0.0.1:" + CONF.porta + "/");
    console.log("Posizioni raccolte: http://127.0.0.1:" + CONF.porta + "/api/mezzi");
  });
  const lavora = async () => {
    if (!fermateP1.length && !fermateP2.length) {
      try { await preparaFermate(); } catch (e) { /* si riprova al giro dopo */ }
    }
    if (fermateP1.length || fermateP2.length) {
      try { await giro(); } catch (e) { console.error("giro non riuscito: " + e.message); }
    }
    setTimeout(lavora, CONF.intervalloMs);
  };
  lavora();
})();
