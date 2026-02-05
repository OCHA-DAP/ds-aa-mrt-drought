from io import BytesIO

import ocha_stratus as stratus
import requests

from src.constants import ISO3, PROJECT_PREFIX

BASE_URL = "https://www.fao.org/giews/earthobservation/asis/data/country/{iso3_upper}/MAP_ASI/DATA/ASI_Dekad_Season1_data.csv"  # noqa


def download_asi(iso3: str = ISO3):
    url = BASE_URL.format(iso3_upper=iso3.upper())
    response = requests.get(url)
    if response.status_code != 200:
        raise Exception(
            f"Error {response.status_code} when downloading "
            f"ASI data from {url}."
        )
    csv_data = BytesIO(response.content)
    blob_name = (
        f"{PROJECT_PREFIX}/raw/asi/ASI_Dekad_Season1_data_{iso3.lower()}.csv"
    )
    stratus.upload_blob_data(
        data=csv_data, blob_name=blob_name, content_type="text/csv"
    )


def load_asi(iso3: str = ISO3):
    blob_name = (
        f"{PROJECT_PREFIX}/raw/asi/ASI_Dekad_Season1_data_{iso3.lower()}.csv"
    )
    asi_df = stratus.load_csv_from_blob(blob_name=blob_name)
    return asi_df
