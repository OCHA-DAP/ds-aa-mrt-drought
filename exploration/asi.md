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

# ASI

```python
%load_ext jupyter_black
%load_ext autoreload
%autoreload 2
```

```python
import ocha_stratus as stratus
import pandas as pd
import numpy as np

from src.datasources import asi
from src.constants import *
```

```python
adm1 = stratus.datasources.codab.load_codab_from_fieldmaps(
    iso3=ISO3, admin_level=1
)
```

```python
adm1["area"] = adm1.to_crs(3857).geometry.area
```

```python
adm1
```

```python
asi.download_asi()
```

```python
df_asi = asi.load_asi()
```

```python
df_asi
```

```python
df_asi["Province"].unique()
```

```python
province2pcode = {
    "Guidimakha": GUIDIMAKHA1,
    "Assaba": ASSABA1,
    "Brakna": "MR05",
    "Gorgol": "MR04",
    "Hodh Ech Chargi": "MR01",
    "Hodh El Gharbi": "MR02",
    "Tagant": "MR09",
    "Trarza": "MR06",
}
```

```python
df_asi["adm1_src"] = df_asi["Province"].replace(province2pcode)
```

```python
df_asi["adm1_src"].unique()
```

```python
df_asi = df_asi.merge(adm1[["adm1_src", "area"]])
```

```python
df_asi["weighted_asi"] = df_asi["Data"] * df_asi["area"]
```

```python
def groupby_weighted_mean(
    df: pd.DataFrame,
    group_cols,
    value_col: str,
    weight_col: str,
    result_name: str = "weighted_mean",
):
    """
    Compute weighted mean after groupby.

    Parameters
    ----------
    df : DataFrame
    group_cols : str or list of str
        Columns to group by
    value_col : str
        Column containing values
    weight_col : str
        Column containing weights
    result_name : str
        Name of output column

    Returns
    -------
    DataFrame
        Grouped weighted mean
    """

    def _wmean(x):
        v = x[value_col]
        w = x[weight_col]
        return np.average(v, weights=w)

    return (
        df.groupby(group_cols, as_index=False)
        .apply(_wmean, include_groups=False)
        .rename(columns={None: result_name})
    )
```

```python
df_asi_all_dekadal = groupby_weighted_mean(
    df_asi,
    ["Year", "Month", "Dekad"],
    value_col="Data",
    weight_col="area",
    result_name="asi_all",
)
```

```python
df_asi_aoi_dekadal = groupby_weighted_mean(
    df_asi[df_asi["adm1_src"].isin(ADM1_AOI_PCODES)],
    ["Year", "Month", "Dekad"],
    value_col="Data",
    weight_col="area",
    result_name="asi_aoi",
)
```

```python
df_asi_dekadal = df_asi_all_dekadal.merge(df_asi_aoi_dekadal)
```

```python
df_asi_dekadal.corr()
```

```python
df_asi_dekadal["date"] = pd.to_datetime(
    dict(
        year=df_asi_dekadal["Year"],
        month=df_asi_dekadal["Month"],
        day=df_asi_dekadal["Dekad"].map({1: 1, 2: 11, 3: 21}),
    )
)
```

```python
df_asi_dekadal.plot(x="date", y=["asi_all", "asi_aoi"])
```

```python
df_asi_dekadal["dekad_overall"] = (
    df_asi_dekadal["Month"] - 1
) * 3 + df_asi_dekadal["Dekad"]
```

```python
df_asi_dekadal.groupby("dekad_overall").size()
```

```python
df_asi_dekadal.pivot(
    columns="Year", index="dekad_overall", values="asi_aoi"
).plot()
```

```python
df_asi_dekadal
```

```python
eos_dekad = 9 * 3
```

```python
eos_dekad
```

```python
df_asi_eos = df_asi_dekadal[df_asi_dekadal["dekad_overall"] == eos_dekad]
```

```python
df_asi_eos.plot(x="Year", y="asi_aoi")
```

```python
df_asi_dekadal
```

```python
blob_name = f"{PROJECT_PREFIX}/processed/asi/mrt_asi_dekadal.parquet"
stratus.upload_parquet_to_blob(df_asi_dekadal, blob_name)
```
