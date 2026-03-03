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

# Dekad combination

```python
%load_ext jupyter_black
%load_ext autoreload
%autoreload 2
```

```python
import calendar
import ocha_stratus as stratus
import pandas as pd
import numpy as np
import statsmodels.api as sm
import matplotlib.pyplot as plt
from scipy.special import expit  # logistic function


from src.constants import *
```

```python
blob_name = f"{PROJECT_PREFIX}/processed/iri_cerf_stats.parquet"
df_stats_iri = stratus.load_parquet_from_blob(blob_name)
```

```python
df_stats_iri
```

```python
df_stats_iri_full = df_stats_iri[df_stats_iri["year"] < 2025]
```

```python
blob_name = (
    f"{PROJECT_PREFIX}/processed/chirps/chirps_dek_season_cumul.parquet"
)
df_chirps_raw = stratus.load_parquet_from_blob(blob_name)
```

```python
df_chirps_raw
```

```python
df_dek = df_chirps_raw[
    (df_chirps_raw["year"] < 2025) & (df_chirps_raw["year"] >= 1991)
].copy()
```

```python
df_chirps_final = df_chirps_raw[df_chirps_raw["dekad_overall"] == 27]
```

```python
df_stats_iri_full = df_stats_iri_full.merge(
    df_chirps_final[["year", "rfh_all_cumul", "rfh_aoi_cumul"]]
)
```

```python
df_stats_iri_full.plot(
    x="CHIRPS Precip JAS (mm)", y="rfh_all_cumul", linewidth=0, marker="."
)
```

```python
df_stats_iri_full.corr(numeric_only=True, method="spearman")["rfh_all_cumul"][
    "CHIRPS Precip JAS (mm)"
]
```

```python
for col in ["rfh_all_cumul", "CHIRPS Precip JAS (mm)"]:
    df_stats_iri_full[f"{col}_rank"] = df_stats_iri_full[col].rank(
        ascending=True
    )
```

```python
df_stats_iri_full.sort_values("rfh_all_cumul_rank")
```

```python
df_stats_iri_full.plot(x="year", y="rfh_all_cumul")
```

```python
n_total_years = df_dek["year"].nunique()
rp_overall_target = 7
n_years_overall_target = int((n_total_years + 1) / rp_overall_target)
```

```python
n_years_overall_target
```

```python
df_stats_iri = df_stats_iri.merge(
    df_chirps_final[["year", "rfh_all_cumul", "rfh_aoi_cumul"]]
)
```

```python
col = "rfh_all_cumul"

df_stats_iri["obsv_target"] = (
    df_stats_iri[col]
    <= df_stats_iri[col].nsmallest(n_years_overall_target).max()
)
```

```python
df_stats_iri_full
```

```python
df_dek = df_dek.merge(df_stats_iri[["year", "obsv_target"]], how="left")
```

```python
dicts = []
for dekad, group in df_dek.groupby("dekad_overall"):
    for _trig_years in range(n_years_overall_target, -1, -1):
        _thresh = (
            group[col].nsmallest(_trig_years).max()
            + group[col].nsmallest(_trig_years + 1).max()
        ) / 2
        group["_trigger"] = group[col] <= _thresh
        fp = group["_trigger"] & ~group["obsv_target"]
        if not fp.any():
            df_stats_iri[f"d{dekad}_trig"] = df_stats_iri["year"].isin(
                group[group["_trigger"]]["year"].unique()
            )
            dicts.append(
                {"dekad": dekad, "thresh": _thresh, "n_years": _trig_years}
            )
            break

df_threshs = pd.DataFrame(dicts)
```

```python
df_threshs
```

```python
def highlight_true(val):
    if isinstance(val, bool) and val is True:
        return "background-color: crimson"
    return ""
```

```python
cols = [f"d{x}_trig" for x in range(19, 28)]
```

```python
df_stats_iri.set_index("year")[cols].style.map(highlight_true)
```

```python
df_stats_iri.set_index("year")[cols].mean().plot.bar()
```

```python
df_dek = df_dek.merge(
    df_threshs.rename(columns={"dekad": "dekad_overall"}), how="left"
)
```

```python
df_dek["obsv_trig"] = df_dek["rfh_all_cumul"] <= df_dek["thresh"]
```

```python
df_dek[df_dek["dekad_overall"] == 27].sort_values("rfh_all_cumul")
```

```python
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(7, 7), dpi=200)

col = "rfh_all_cumul"

cmap = plt.cm.tab10
color_idx = 0

year_colors = {}  # store colors for triggered years

for year, group in df_dek.groupby("year"):

    first_dek_trig = group[group["obsv_trig"]]["dekad_overall"].min()
    any_trig = group["obsv_trig"].any()

    if any_trig:
        color = cmap(color_idx % cmap.N)
        year_colors[year] = color
        color_idx += 1
    else:
        color = "lightgrey"

    if any_trig:
        group_trig = group[group["dekad_overall"] >= first_dek_trig]
        group_notrig = group[group["dekad_overall"] <= first_dek_trig]
    else:
        group_trig = group.iloc[0:0]
        group_notrig = group

    if len(group_trig):
        group_trig.plot(
            x="dekad_overall",
            y=col,
            ax=ax,
            color=color,
            alpha=0.7,
            linewidth=1.5,
        )

    group_notrig.plot(
        x="dekad_overall",
        y=col,
        ax=ax,
        color=color,
        alpha=0.5,
        linewidth=0.7,
    )

df_threshs.plot(
    x="dekad",
    y="thresh",
    ax=ax,
    color="k",
    linewidth=1,
    linestyle="--",
)

# ---- annotate years on right edge ----

x_text = 27  # slightly beyond axis limit

y_adj = {
    2019: 2.5,
    1991: 1,
    1996: 0,
    2002: -2,
}

for year, color in year_colors.items():
    group = df_dek[df_dek["year"] == year]

    # get last dekad value within plotting window
    last_row = group[group["dekad_overall"] == 27]

    if not last_row.empty:
        y_val = last_row[col].values[0]
        ax.text(
            x_text,
            y_val + y_adj.get(year, 0),
            str(year),
            color=color,
            fontsize=8,
            va="center",
        )

# formatting
ax.set_xlabel("Dékade")
ax.set_ylabel("Précipitations cumulatives (mm) [CHIRPS]")
ax.set_xlim((19, 27))  # extend slightly for labels
ax.set_ylim(bottom=0)

ax.legend().set_visible(False)

[ax.spines[x].set_visible(False) for x in ["top", "right"]]
```

```python

```
