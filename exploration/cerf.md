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

# CERF

```python
%load_ext jupyter_black
%load_ext autoreload
%autoreload 2
```

```python
from io import BytesIO

import ocha_stratus as stratus
import pandas as pd

from src.constants import *
```

```python
blob_name = "cerf/AllocationsByYear.xlsx"
df_cerf_raw = pd.read_excel(
    BytesIO(stratus.load_blob_data(blob_name, container_name="global"))
)
```

```python
df_cerf = df_cerf_raw[
    (df_cerf_raw["Country"] == "Mauritania")
    & (df_cerf_raw["Window"] == "Rapid Response")
    & (df_cerf_raw["Emergency"] == "Drought")
].copy()
```

```python
df_cerf
```

```python
df_cerf["year"] = [
    2017,
    2014,  # could also be 2015
    2011,
    2009,
    2008,
    2007,
]
```

```python
blob_name = f"{PROJECT_PREFIX}/processed/cerf/mrt_drought_allocations.parquet"
stratus.upload_parquet_to_blob(df_cerf, blob_name)
```
