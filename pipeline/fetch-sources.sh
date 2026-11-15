#!/usr/bin/env bash
# Fetches the open-licensed Z-Anatomy source models and converts them to raw glTF.
# Source: https://github.com/LluisV/Z-Anatomy (models CC-BY-SA 4.0, derived from BodyParts3D CC-BY-SA 2.1 JP)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ANATOMY_SRC:-$ROOT/.sources}"
RAW="$SRC/raw"
mkdir -p "$SRC" "$RAW"

if [ ! -d "$SRC/zanat/.git" ]; then
  git clone --depth 1 --filter=blob:none --no-checkout https://github.com/LluisV/Z-Anatomy "$SRC/zanat"
  git -C "$SRC/zanat" sparse-checkout init --no-cone
  git -C "$SRC/zanat" sparse-checkout set \
    '/README.md' '/LICENSE' '/Resources/Models/' \
    '/Resources/Descriptions/OriginalDescriptions/' \
    '/Z-Anatomy PC/Assets/Models/1.0 Models/*.fbx' \
    '/Z-Anatomy PC/Assets/Models/Layers/**/*.txt' \
    '/Z-Anatomy PC/Assets/Models/Collections/**/*.txt' \
    '/Z-Anatomy PC/Assets/Resources/*.txt'
  git -C "$SRC/zanat" checkout PC-Version
fi

FBX2GLTF="$ROOT/node_modules/fbx2gltf/bin/Linux/FBX2glTF"
[ "$(uname)" = "Darwin" ] && FBX2GLTF="$ROOT/node_modules/fbx2gltf/bin/Darwin/FBX2glTF"
M="$SRC/zanat/Z-Anatomy PC/Assets/Models/1.0 Models"
for pair in "CardioVascular41:cardio" "Joints100:joints" "LymphoidOrgans100:lymph" "MuscularSystem100:muscular" \
            "NervousSystem100:nervous" "Regions of human body100:regions" "SkeletalSystem100:skeletal" "VisceralSystem100:visceral"; do
  src="${pair%%:*}"; out="${pair##*:}"
  [ -f "$RAW/$out.glb" ] || "$FBX2GLTF" --binary --input "$M/$src.fbx" --output "$RAW/$out"
done
# Female anatomy: HuBMAP Human Reference Atlas 3D Reference Object Library (CC BY 4.0)
# https://github.com/hubmapconsortium/ccf-3d-reference-object-library
HRA_COMMIT=f1a3a63f110e27ff0736047d52d04dba5d3087f9
if [ ! -d "$SRC/hra/.git" ]; then
  git clone --filter=blob:none --no-checkout https://github.com/hubmapconsortium/ccf-3d-reference-object-library "$SRC/hra"
  git -C "$SRC/hra" sparse-checkout init --no-cone
  git -C "$SRC/hra" sparse-checkout set '/README.md' '/LICENSE*' \
    '/VH_Female/v1.2/VH_F_Uterus.glb' '/VH_Female/v1.2/VH_F_Ovary_*.glb' '/VH_Female/v1.2/VH_F_Fallopian_Tube_*.glb' \
    '/VH_Female/v1.2/VH_F_Vagina.glb' '/VH_Female/v1.2/VH_F_Ligaments_Uterus_Ovaries.glb' \
    '/VH_Female/v1.2/VH_F_Blood_Vasculature_Uterus.glb' '/VH_Female/v1.2/VH_F_Pelvis.glb' \
    '/VH_Female/v1.2/VH_F_Urinary_Bladder.glb' '/VH_Female/v1.2/VH_F_Skin.glb' '/VH_Female/v1.3/VH_F_mammary_gland_*.glb'
  git -C "$SRC/hra" checkout "$HRA_COMMIT"
fi
echo "Sources ready in $SRC"
