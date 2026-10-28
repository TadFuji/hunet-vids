#!/bin/zsh -f
cd "${0:A:h}" || exit 1
if [[ -x /opt/homebrew/bin/node ]]; then
  omni_node=/opt/homebrew/bin/node
elif [[ -x /usr/local/bin/node ]]; then
  omni_node=/usr/local/bin/node
else
  omni_node=$(command -v node)
fi
if [[ -z "$omni_node" ]]; then
  print 'Node.js 22以降が見つかりません。'; read '?Enterで閉じます。'; exit 1
fi
"$omni_node" tools/manage-server.mjs start
omni_result=$?
if [[ $omni_result -ne 0 ]]; then read '?Enterで閉じます。'; fi
exit $omni_result
