---
jupyter:
  jupytext:
    formats: ipynb,md
    text_representation:
      extension: .md
      format_name: markdown
      format_version: '1.3'
      jupytext_version: 1.19.1
  kernelspec:
    display_name: ds-aa-mrt-drought
    language: python
    name: ds-aa-mrt-drought
---

# CHIRPS

```python
%load_ext jupyter_black
%load_ext autoreload
%autoreload 2
```

```python
import ocha_stratus as stratus
import pandas as pd

from src.constants import *
from src.utils.aggregation import groupby_weighted_mean
```

```python
blob_name = f"{PROJECT_PREFIX}/raw/chirps/mrt-rainfall-subnat-full.csv"
df_raw = stratus.load_csv_from_blob(blob_name)
```

```python
df_raw["date"] = pd.to_datetime(df_raw["date"])
```

```python
season_months = [7, 8, 9]
```

```python
df_season = df_raw[df_raw["date"].dt.month.isin(season_months)].copy()
```

```python
df_season_aoi = df_season[df_season["PCODE"].isin(ADM1_AOI_PCODES)].copy()
```

```python
df_dek_all = groupby_weighted_mean(
    df_season,
    group_cols="date",
    value_col="rfh",
    weight_col="n_pixels",
    result_name="rfh",
)
```

```python
df_dek_aoi = groupby_weighted_mean(
    df_season_aoi,
    group_cols="date",
    value_col="rfh",
    weight_col="n_pixels",
    result_name="rfh",
)
```

```python
df_dek = df_dek_all.merge(df_dek_aoi, on="date", suffixes=("_all", "_aoi"))
```

```python
df_dek = df_dek.sort_values("date")
df_dek["year"] = df_dek["date"].dt.year
```

```python
for x in ["all", "aoi"]:
    df_dek[f"rfh_{x}_cumul"] = df_dek.groupby("year")[f"rfh_{x}"].cumsum()
```

```python
df_dek["dekad"] = df_dek["date"].dt.day.floordiv(10) + 1
```

```python
df_dek[df_dek["year"] == 2002]
```

```python
df_dek["dekad_overall"] = (df_dek["date"].dt.month - 1) * 3 + df_dek["dekad"]
```

```python
sel_years = range(2000, 2025)
df_dek[df_dek["year"].isin(sel_years)].pivot(
    index="dekad_overall", columns="year", values="rfh_all_cumul"
).plot()
```

```python
blob_name = (
    f"{PROJECT_PREFIX}/processed/chirps/chirps_dek_season_cumul.parquet"
)
stratus.upload_parquet_to_blob(df_dek, blob_name)
```

```python

```
