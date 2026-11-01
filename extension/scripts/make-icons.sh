#!/bin/sh
# Render scripts/icon.svg -> icons/icon{16,48,128}.png via headless Chrome
cd "$(dirname "$0")/.." || exit 1
for s in 128 48 16; do
  printf '<html><body style="margin:0;background:transparent"><img src="file://%s/scripts/icon.svg" width="%s" height="%s"></body></html>' "$PWD" $s $s > /tmp/icon_$s.html
  google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --default-background-color=00000000 --window-size=$s,$s --screenshot=icons/icon$s.png file:///tmp/icon_$s.html >/dev/null 2>&1
done
echo icons ok
