import os

import pandas as pd
import requests
from pandas import json_normalize

from src.constants import ISO2

IPC_BASE_URL = "https://api.ipcinfo.org"
IPC_AUTH = os.environ.get("IPC_AUTH")


def process_all_subnational_ipc_analyses_from_population(iso2: str = ISO2):
    endpoint = "population"
    params = {"format": "json", "key": IPC_AUTH, "country": iso2}
    url = f"{IPC_BASE_URL}/{endpoint}"
    response = requests.get(url, params=params)
    if response.status_code != 200:
        raise Exception(
            f"Error {response.status_code} when downloading "
            f"IPC population data."
        )

    json_data = response.json()

    # Top-level normalize
    df_top = json_normalize(json_data)
    df_top.columns = [
        "top_" + col if col != "groups" else col for col in df_top.columns
    ]
    df_top = df_top.explode("groups").reset_index(drop=True)

    # Normalize groups
    df_groups = json_normalize(df_top["groups"])
    df_groups.columns = ["group_" + col for col in df_groups.columns]

    df_merged = pd.concat([df_top.drop(columns=["groups"]), df_groups], axis=1)

    # Explode group_areas
    df_merged = df_merged.explode("group_areas").reset_index(drop=True)

    # Normalize areas
    df_areas = json_normalize(df_merged["group_areas"])
    df_areas.columns = ["area_" + col for col in df_areas.columns]

    final_df = pd.concat(
        [df_merged.drop(columns=["group_areas"]), df_areas], axis=1
    )

    return final_df
