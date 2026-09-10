#!/bin/bash
# Avvia la mappa degli autobus TPL FVG. Doppio clic su questo file.
cd "$(dirname "$0")" || exit 1

echo
echo '  Autobus in tempo reale in Friuli Venezia Giulia'
echo '  ==============================================='
echo

if ! command -v node >/dev/null 2>&1; then
  echo '  Node.js non risulta installato su questo computer.'
  echo
  echo '  Lo scarichi da   https://nodejs.org'
  echo '  Scelga la versione LTS e faccia una installazione normale.'
  echo '  Poi riavvii questo file con un doppio clic.'
  echo
  read -n 1 -s -r -p '  Prema un tasto per chiudere.'
  exit 1
fi

if [ ! -f aggregatore_tplfvg.js ] || [ ! -f autobus_fvg.html ]; then
  echo '  Mancano dei file in questa cartella.'
  echo '  Servono tutti e tre insieme:'
  echo '    autobus_fvg.html'
  echo '    aggregatore_tplfvg.js'
  echo '    questo file di avvio'
  echo
  read -n 1 -s -r -p '  Prema un tasto per chiudere.'
  exit 1
fi

echo '  Avvio in corso. La pagina si apre da sola nel browser.'
echo '  Lasci aperta questa finestra: e il programma che raccoglie le posizioni.'
echo '  Per fermare tutto, chiuda questa finestra oppure prema Ctrl+C.'
echo

export APRI_BROWSER=1
node aggregatore_tplfvg.js

echo
read -n 1 -s -r -p '  Il programma si e fermato. Prema un tasto per chiudere.'
