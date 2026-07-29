#!/usr/bin/env bash
# ------------------------------------------------------------------
# Downloads the site's stock photography into public/assets/ and
# rewrites the pages to use the local copies (self-hosted, no CDN
# dependency). Run from any machine with normal internet access:
#
#     bash scripts/fetch-images.sh
#
# All photos are from Pexels. License: free for commercial use, no
# attribution required, modification allowed.
#     https://www.pexels.com/license/
# Photo pages (for review): https://www.pexels.com/photo/{anything}-{id}/
# ------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/assets

# name -> Pexels photo id
declare -A IMGS=(
  [hero-home]=1029599            # white house, red trim, picket fence, fall foliage
  [dusk-home]=106399             # two-story home at dusk, warm windows
  [ext-classic]=4682075          # classic home exterior, tidy yard
  [family-street]=2253879        # family walking a tree-lined street
  [porch-couple]=1230275         # couple on a porch swing
  [int-living]=8583697           # bright living room
  [int-white-living]=271753      # all-white living room
  [int-kitchen]=6835094          # kitchen, white cabinetry
  [int-bedroom]=8583859          # airy bedroom
  [int-dining]=7534294           # open-plan dining/living
  [int-entry]=6487955            # entry hallway (portrait)
  [cabinets-island]=2089698      # white shaker kitchen + island
  [cabinets-fridge]=2343467      # white cabinets + fridge (portrait)
  [painter-roller]=6474471       # painter rolling a wall
  [paint-roller-closeup]=1669754 # roller close-up, fresh white paint
  [wallpaper-team]=7218011       # two sets of hands rolling a wall
  [color-swatches]=1573825       # fanned color swatches
  [commercial-lift]=32115287     # exterior painting from a lift
  # team photo intentionally omitted — the owner will supply a real crew photo
)

echo "Downloading $(( ${#IMGS[@]} )) images…"
for name in "${!IMGS[@]}"; do
  id=${IMGS[$name]}
  url="https://images.pexels.com/photos/$id/pexels-photo-$id.jpeg?auto=compress&cs=tinysrgb&w=1600"
  out="public/assets/$name.jpg"
  curl -fsSL --retry 3 "$url" -o "$out"
  # sanity: reject anything that isn't an actual image
  if ! file --mime-type "$out" | grep -q 'image/'; then
    echo "✗ $name (id $id) did not return an image — removed" >&2
    rm -f "$out"
    continue
  fi
  echo "  ✓ $name.jpg ($(du -h "$out" | cut -f1))"
done

echo "Rewriting pages to use local copies…"
for f in public/*.html; do
  for name in "${!IMGS[@]}"; do
    id=${IMGS[$name]}
    [ -f "public/assets/$name.jpg" ] || continue
    sed -i.bak -E "s#https://images\.pexels\.com/photos/$id/[^\"]*#assets/$name.jpg#g" "$f"
  done
done
rm -f public/*.html.bak
echo "Done — photos are now self-hosted in public/assets/."
