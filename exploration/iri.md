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

# IRI

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
import matplotlib.pyplot as plt
from sklearn.metrics import roc_auc_score

from src.constants import *
```

```python
blob_name = f"{PROJECT_PREFIX}/processed/iri_cerf_stats.parquet"
df_stats_iri = stratus.load_parquet_from_blob(blob_name)
df_stats_iri = df_stats_iri[df_stats_iri["year"] < 2025]
```

```python
df_stats_iri
```

```python
min_year, max_year = 1991, 2024
total_years = max_year - min_year + 1
rp_overall_target = 4
n_years_overall_target = int((max_year - min_year + 1 + 1) / rp_overall_target)
```

```python
max_badyear_target = df_stats_iri.sort_values(
    "Humanitarian Bad Years (rank)"
).iloc[n_years_overall_target - 1]["Humanitarian Bad Years (rank)"]
```

```python
df_stats_iri["target"] = (
    df_stats_iri["Humanitarian Bad Years (rank)"] <= max_badyear_target
)
```

```python
df_stats_iri["target"].sum()
```

```python
thresh_chirps = (
    df_stats_iri["CHIRPS Precip JAS (mm)"]
    .nsmallest(n_years_overall_target)
    .max()
)
df_stats_iri["target_chirps"] = (
    df_stats_iri["CHIRPS Precip JAS (mm)"] <= thresh_chirps
)
```

```python
df_stats_iri["target_chirps"].sum()
```

```python
df_stats_iri.corr(numeric_only=True)["target"].plot.bar()
```

```python
df_stats_iri.corr(numeric_only=True)["Humanitarian Bad Years (rank)"][
    [calendar.month_abbr[x] for x in range(1, 7)]
].plot.bar()
```

```python
df_stats_iri.corr(numeric_only=True)["CHIRPS Precip JAS (mm)"][
    [calendar.month_abbr[x] for x in range(1, 7)]
].plot.bar(title="Corrélation avec CHIRPS")
```

```python
df_stats_iri.corr(numeric_only=True)["target_chirps"][
    [calendar.month_abbr[x] for x in range(1, 7)]
].plot.bar()
```

```python
target_col = "target"

results = []

for target_col in ["target", "target_chirps"]:
    for mo in range(1, 7):
        auc = roc_auc_score(
            df_stats_iri[target_col], df_stats_iri[calendar.month_abbr[mo]]
        )
        results.append({"mo": mo, "roc_auc": auc, "target_col": target_col})


df_roc = pd.DataFrame(results)
df_roc
```

```python
df_roc.pivot(index="mo", columns="target_col", values="roc_auc").plot()
```

```python

```

```python
for mo in range(1, 7):
    df_stats_iri[f"rank_{mo}"] = df_stats_iri[calendar.month_abbr[mo]].rank(
        ascending=False
    )
```

```python
df_stats_iri
```

```python
trig_cols = [f"trig_{mo}" for mo in range(3, 7)]

dicts = []
for ind_trig_years in range(1, total_years):
    rp_ind = (total_years + 1) / ind_trig_years
    cols = []
    for mo in range(3, 7):
        df_stats_iri[f"trig_{mo}"] = (
            df_stats_iri[f"rank_{mo}"] <= ind_trig_years
        )
    df_stats_iri["trig_overall"] = df_stats_iri[trig_cols].any(axis=1)
    pp = df_stats_iri["trig_overall"]
    rp = (total_years + 1) / pp.sum()
    for target_col in ["target", "target_chirps"]:
        p = df_stats_iri[target_col]
        tp = p & pp
        tpr = tp.sum() / p.sum()
        ppv = tp.sum() / pp.sum()
        f1 = 2 * tpr * ppv / (tpr + ppv)

        dicts.append(
            {
                "rp": rp,
                "tpr": tpr,
                "ppv": ppv,
                "f1": f1,
                "target_col": target_col,
                "rp_ind": rp_ind,
                "ind_years": ind_trig_years,
            }
        )

df_metrics = pd.DataFrame(dicts)
```

```python
fig, ax = plt.subplots()
df_metrics[df_metrics["target_col"] == "target"].plot(
    x="rp_ind", y="rp", ax=ax, legend=False
)

ax.set_xlabel("Période de retour individuelle (ans)")
ax.set_ylabel("Période de retour globale (ans)")
[ax.spines[x].set_visible(False) for x in ["top", "right"]]
```

```python
df_metrics[df_metrics["target_col"] == "target_chirps"]
```

```python
df_metrics[df_metrics["target_col"] == "target_chirps"].plot(
    x="rp", y=["f1", "tpr", "ppv"]
)
```

```python
df_metrics[df_metrics["target_col"] == "target_chirps"].plot(
    x="ind_years", y=["f1", "tpr", "ppv"]
)
```

```python
df_metrics[df_metrics["target_col"] == "target_chirps"]
```

```python
df_metrics[df_metrics["target_col"] == "target_chirps"]
```

```python
ind_trig_years = 2

rp_ind = (total_years + 1) / ind_trig_years
cols = []
for mo in range(1, 7):
    df_stats_iri[f"trig_{mo}"] = df_stats_iri[f"rank_{mo}"] <= ind_trig_years
df_stats_iri["trig_overall"] = df_stats_iri[trig_cols].any(axis=1)
```

```python
df_stats_iri.plot(x="year", y=[calendar.month_abbr[x] for x in range(1, 7)])
```

```python
df_stats_iri["trig_overall"].sum()
```

```python
df_stats_iri.columns
```

```python
def highlight_triggered(row):
    styles = [""] * len(row)

    col_map = {
        "Mar": "trig_3",
        "Apr": "trig_4",
        "May": "trig_5",
        "Jun": "trig_6",
        "CHIRPS Precip JAS (mm)": "target_chirps",
    }

    for i, col in enumerate(row.index):
        if col in col_map and row.get(col_map[col], False):
            styles[i] = "background-color: crimson"
    return styles


cols = (
    [calendar.month_abbr[x] for x in range(3, 7)]
    + ["CHIRPS Precip JAS (mm)"]
    + [f"trig_{x}" for x in range(3, 7)]
    + ["target_chirps"]
)

df_stats_iri.sort_values("year", ascending=False).set_index("year")[
    cols
].style.apply(highlight_triggered, axis=1).format("{:.1f}")
```

```python
thresh_chirps = (
    df_stats_iri[df_stats_iri["target_chirps"]]["CHIRPS Precip JAS (mm)"].max()
    + df_stats_iri[~df_stats_iri["target_chirps"]][
        "CHIRPS Precip JAS (mm)"
    ].min()
) / 2

for mo in range(3, 7):
    col = calendar.month_abbr[mo]
    fig, ax = plt.subplots(figsize=(7, 7))
    df_stats_iri.plot(
        x=col,
        y="CHIRPS Precip JAS (mm)",
        ax=ax,
        linewidth=0,
        # marker=".",
        legend=False,
    )
    for _, row in df_stats_iri.iterrows():
        ax.annotate(
            row["year"],
            row[[col, "CHIRPS Precip JAS (mm)"]],
            va="center",
            ha="center",
        )
    thresh = (
        df_stats_iri[df_stats_iri[f"trig_{mo}"]][col].min()
        + df_stats_iri[~df_stats_iri[f"trig_{mo}"]][col].max()
    ) / 2
    ax.axhline(thresh_chirps)
    ax.axvline(thresh)
    ax.set_title(col)
    ax.set_xlabel("Prévision (probabilité de sécheresse)")
    ax.set_ylabel("Observation (CHIRPS, mm)")
```
