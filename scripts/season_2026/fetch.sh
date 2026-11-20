#!/usr/bin/env bash
# Download the raw inputs for the 2026 season review into data/season_2026/raw/ (gitignored).
# All sources are public and need no credentials. Run from the repo root:
#   scripts/season_2026/fetch.sh
# then
#   uv run scripts/season_2026/build.py
set -euo pipefail
OUT=${1:-data/season_2026/raw}
mkdir -p "$OUT"
cd "$OUT"

# CHIRPS dekadal rainfall by admin unit (WFP, on HDX) -- the framework's Window 2 source.
curl -sSL --max-time 600 -o chirps_hdx.csv \
  "https://data.humdata.org/dataset/7680b3f0-aa0a-45b3-8fc7-ddc29efdccc7/resource/ebc25750-7082-4b85-bef7-83601c7fb64d/download/mrt-rainfall-subnat-full.csv"

# FAO GIEWS ASIS: Agricultural Stress Index (annual and dekadal) and dekadal weighted mean VHI, cropland, by wilaya.
B="https://www.fao.org/giews/earthobservation/asis/data/country/MRT/MAP_ASI/DATA"
curl -sSL --max-time 300 -o asi_annual.csv "$B/ASI_AnnualSummary_Season1_data.csv"
curl -sSL --max-time 300 -o asi_dekad.csv "$B/ASI_Dekad_Season1_data.csv"
curl -sSL --max-time 300 -o mvhi_dekad.csv "$B/MVHI_Dekad_Season1_data.csv"
# ECMWF rainfall on cropland by wilaya (ASIS), only to cross-check CHIRPS and the ECMWF temperature.
curl -sSL --max-time 300 -o ecmwf_rain_asis.csv \
  "https://www.fao.org/giews/earthobservation/asis/data/country/MRT/GRAPH_RAIN_AGRI/rain_adm1_data.csv"

# JRC ASAP indicator statistics, GAUL1, Mauritania (country_id 129):
# temperature on the rangeland mask (variable 140, class 2, whole mask) and
# cumulative-FPAR z-score on rangeland during the growing cycle (variable 240, class 2, classesset 1).
A="https://agricultural-production-hotspots.ec.europa.eu/export/rum/export.php?gaul_level=1&country_id=129"
curl -sSL --max-time 600 -o asap_temp_range.csv "$A&variable_id=140&class_id=2&classesset_id=2&sensor_id=4"
curl -sSL --max-time 600 -o asap_zfparc_range.csv "$A&variable_id=240&class_id=2&classesset_id=1&sensor_id=3"
for f in asap_temp_range.csv asap_zfparc_range.csv; do
  head -c 10 "$f" | grep -q '^country_id' || { echo "ASAP export $f is not a CSV" >&2; exit 1; }
done

# GeoSahel (Action contre la Faim): biomass (dekadal DMP + yearly totals) and surface water, by wilaya
# and moughataa. The geoserver moved from http://213.206.230.89:8080 to https://geosahel.info/geoserver
# (old port closed, found 2026-11-20).
G="https://geosahel.info/geoserver"
for L in ADM1 ADM2; do
  curl -sSL --max-time 600 -o "bio_${L}.csv" \
    "$G/Biomass/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=Biomass:WA_BIO_${L}_v4&outputFormat=csv&CQL_FILTER=adm0_pcode%3D%27MR%27"
  curl -sSL --max-time 600 -o "wb_${L}.csv" \
    "$G/Water/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=Water:WA_WB_${L}_v3&outputFormat=csv&CQL_FILTER=adm0_pcode%3D%27MR%27"
done

# COD-AB Mauritania (v03), admin 1 and 2.
curl -sSL --max-time 300 -o cod.zip \
  "https://data.humdata.org/dataset/8d49f50d-92a8-46d9-9462-f821a8058f6d/resource/916850dc-92e3-4c2b-a972-f6964498346e/download/mrt_admin_boundaries.geojson.zip"
unzip -o -q -j cod.zip mrt_admin1.geojson mrt_admin2.geojson
rm cod.zip
ls -la
