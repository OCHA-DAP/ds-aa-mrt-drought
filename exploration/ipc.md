---
jupyter:
  jupytext:
    formats: ipynb,md
    text_representation:
      extension: .md
      format_name: markdown
      format_version: '1.3'
      jupytext_version: 1.16.1
  kernelspec:
    display_name: ds-aa-mrt-drought
    language: python
    name: ds-aa-mrt-drought
---

# IPC

```python
%load_ext jupyter_black
%load_ext autoreload
%autoreload 2
```

```python
from io import BytesIO
from datetime import datetime

import ocha_stratus as stratus
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.ticker import FuncFormatter

from src.datasources import ipc
from src.constants import *
```

```python
adm2 = stratus.datasources.codab.load_codab_from_fieldmaps(
    iso3=ISO3, admin_level=2
)
```

```python
adm2.plot()
```

```python
adm1 = stratus.datasources.codab.load_codab_from_fieldmaps(
    iso3=ISO3, admin_level=1
)
```

```python
adm1
```

```python

```

```python
adm1.plot()
```

```python
df_test = ipc.process_all_subnational_ipc_analyses_from_population()
```

```python
df_test
```

Seems like IPC API only has recent analyses. We can grab the older ones from the CH file on HDX.

```python
blob_name = f"{PROJECT_PREFIX}/raw/ch/cadre_harmonise_caf_ipc_dec25_final.xlsx"
df_full = pd.read_excel(BytesIO(stratus.load_blob_data(blob_name)))
```

```python
df_full.columns
```

```python
df_mrt = df_full[df_full["adm0_pcod3"] == ISO3.upper()]
```

```python
df_mrt["chtype"].value_counts()
```

```python
df_mrt["reference_label"].value_counts()
```

```python
df_mrt["exercise_label"].value_counts()
```

```python
df_mrt[df_mrt["adm1_pcod2"] == "MR10"]["adm1_name"].unique()
```

```python
adm1[adm1["adm1_src"] == "MR10"]
```

Let's just merge and treat Nouakchott as a single adm1

```python
nouak_row = adm1[adm1["adm1_name"].str.contains("Nouakchott")].dissolve()
```

```python
nouak_row["adm1_name"] = "Nouakchott"
```

```python
adm1_single_nouak = pd.concat(
    [adm1[~adm1["adm1_name"].str.contains("Nouakchott")], nouak_row]
)
```

```python
adm1_single_nouak
```

```python
group_cols = [
    "exercise_year",
    "exercise_label",
    "chtype",
    "reference_label",
    "reference_year",
    "adm1_name",
    "adm1_pcod2",
]
```

```python
df_mrt_adm1 = df_mrt.groupby(group_cols).sum(numeric_only=True).reset_index()
```

Oh no it looks like `MR10` is for Nouakchott in this old version of CODAB. In the new version this is for Guidimagha. What a nightmare.

```python
for x in df_mrt_adm1["adm1_pcod2"].unique():
    if x not in adm1["adm1_src"].unique():
        print(x)
```

```python
cols = ["adm1_name", "adm1_pcod2"]
adm1[["adm1_src", "adm1_name"]].merge(
    df_mrt.groupby(cols).first().reset_index()[cols],
    left_on="adm1_src",
    right_on="adm1_pcod2",
    suffixes=("_codab", "_ipc"),
)
```

```python
df_mrt_adm1.columns
```

```python
for x in [1, 2, 3, 4, 5, 35]:
    df_mrt_adm1[f"frac_phase{x}"] = (
        df_mrt_adm1[f"phase{x}"] / df_mrt_adm1["population"]
    )
```

```python
df_mrt_adm1["reference_label"].unique()
```

```python
def ref_label_to_month(x):
    if x == "Jan-May":
        return 3
    elif x == "Jun-Aug":
        return 7
    elif x == "Sep-Dec":
        return 11
    else:
        raise ValueError("invalid reference_label")
```

```python
df_mrt_adm1["reference_month"] = df_mrt_adm1["reference_label"].apply(
    ref_label_to_month
)
```

```python
df_mrt_adm1["reference_date"] = df_mrt_adm1.apply(
    lambda row: datetime(
        year=row["reference_year"], month=row["reference_month"], day=1
    ),
    axis=1,
)
```

```python
df_mrt_adm1_current = (
    df_mrt_adm1[df_mrt_adm1["chtype"] == "current"]
    .groupby(
        [
            "adm1_name",
            "adm1_pcod2",
            "exercise_year",
            "exercise_label",
            "reference_date",
        ]
    )
    .mean(numeric_only=True)
    .reset_index()
)
```

```python
df_mrt_adm1_projected = (
    df_mrt_adm1[df_mrt_adm1["chtype"] == "projected"]
    .groupby(
        [
            "adm1_name",
            "adm1_pcod2",
            "exercise_year",
            "exercise_label",
            "reference_label",
            "reference_year",
            "reference_date",
        ]
    )
    .mean(numeric_only=True)
    .reset_index()
)
```

```python
def french_thousands(x, pos):
    return f"{int(x):,}".replace(",", "\u202f")
```

```python
def plot_stacked_phase35(df, pop_frac: bool = False):
    cols = (
        ["frac_phase3", "frac_phase4", "frac_phase5"]
        if pop_frac
        else ["phase3", "phase4", "phase5"]
    )
    fig, ax = plt.subplots()

    df.set_index("adm1_name")[cols].plot(
        kind="bar",
        stacked=True,
        ax=ax,
        color=[
            "darkorange",
            "crimson",
            "darkred",
        ],
    )
    ax.legend(
        [3, 4, 5],
        title="Phase CH",
    )
    ax.set_xlabel("Région")
    ylabel = "Fraction de population" if pop_frac else "Population"
    ax.set_ylabel(ylabel)
    if not pop_frac:
        ax.yaxis.set_major_formatter(FuncFormatter(french_thousands))
    [ax.spines[x].set_visible(False) for x in ["top", "right"]]
    return fig, ax
```

```python
df_mrt_adm1_current["reference_year"].unique()
```

```python
df_mrt_adm1_current_grouped = (
    df_mrt_adm1_current.groupby("adm1_name")
    .mean(numeric_only=True)
    .reset_index()
)
```

```python
sel_adm1_names = [
    "Gorgol",
    "Guidimakha",
    "Hodh Ech Chargi",
    "Assaba",
    "Brakna",
    "Hodh El Gharbi",
]
```

```python
fig, ax = plt.subplots(figsize=(7, 7), dpi=200)
for _, row in df_mrt_adm1_current_grouped.iterrows():
    ax.annotate(
        row["adm1_name"],
        row[["phase35", "frac_phase35"]],
        ha="center",
        va="center",
        fontweight="bold" if row["adm1_name"] in sel_adm1_names else "normal",
    )

ax.set_xlim(0, df_mrt_adm1_current_grouped["phase35"].max() * 1.1)
ax.set_ylim(0, df_mrt_adm1_current_grouped["frac_phase35"].max() * 1.1)

[ax.spines[x].set_visible(False) for x in ["top", "right"]]

ax.set_xlabel("Population en phase 3+")
ax.set_ylabel("Fraction de population en phase 3+")

ax.xaxis.set_major_formatter(FuncFormatter(french_thousands))

ax.set_title("Population en phase CH 3+\nMoyenne depuis 2014, toutes périodes")
```

```python
fig, ax = plot_stacked_phase35(df_mrt_adm1_current_grouped, pop_frac=True)
ax.set_title(
    "Population actuelle en phase CH 3+\nMoyenne depuis 2014, toutes périodes"
)
```

```python
fig, ax = plot_stacked_phase35(df_mrt_adm1_current_grouped)
ax.set_title(
    "Population actuelle en phase CH 3+\nMoyenne depuis 2014, toutes périodes"
)
```

```python
fig, ax = plot_stacked_phase35(
    df_mrt_adm1_projected.groupby("adm1_name")
    .mean(numeric_only=True)
    .reset_index()
)
ax.set_title(
    "Population projetée en phase CH 3+\nMoyenne depuis 2014, toutes périodes"
)
```

```python
min_year = 2020
fig, ax = plot_stacked_phase35(
    df_mrt_adm1_current[df_mrt_adm1_current["reference_year"] >= min_year]
    .groupby("adm1_name")
    .mean(numeric_only=True)
    .reset_index()
)
ax.set_title(
    f"Population actuelle en phase CH 3+\nMoyenne depuis {min_year}, toutes périodes"
)
```

```python
df_mrt_adm1_current
```

```python
df_mrt_adm1_current.columns
```

```python
# Prep data
df = df_mrt_adm1_current.copy()
df["reference_date"] = pd.to_datetime(df["reference_date"])
df[["phase3", "phase4", "phase5"]] = df[["phase3", "phase4", "phase5"]].apply(
    pd.to_numeric, errors="coerce"
)
df = df.dropna(
    subset=["reference_date", "adm1_name", "phase3", "phase4", "phase5"]
)

adm1_list = sel_adm1_names

fig, axes = plt.subplots(
    nrows=len(adm1_list),
    ncols=1,
    figsize=(10, 1.8 * len(adm1_list)),
    sharex=True,
    sharey=True,
    dpi=200,
)

colors = [
    "darkorange",
    "crimson",
    "darkred",
]
labels = [3, 4, 5]

# Global y max for consistent scaling
df["total"] = df[["phase3", "phase4", "phase5"]].sum(axis=1)
ymax = df["total"].max()

for ax, adm1 in zip(axes, adm1_list):
    df_sub = df[df["adm1_name"] == adm1].sort_values("reference_date")

    x = df_sub["reference_date"]
    y1 = df_sub["phase3"].values
    y2 = df_sub["phase4"].values
    y3 = df_sub["phase5"].values

    # Only show legend once, but always pass iterable
    this_labels = labels if ax is axes[0] else ["", "", ""]

    ax.stackplot(x, y1, y2, y3, colors=colors, labels=this_labels)

    ax.set_xlim(pd.to_datetime(["2014-03-01", "2025-11-01"]))
    ax.set_ylim(0, ymax * 1.1)
    ax.set_ylabel(adm1, rotation=0, ha="right", va="center")
    ax.yaxis.set_major_formatter(FuncFormatter(french_thousands))
    [ax.spines[x].set_visible(False) for x in ["top", "right"]]


axes[-1].set_xlabel("Date")
axes[-1].xaxis.set_major_locator(mdates.YearLocator())
axes[-1].xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
axes[0].legend(title="Phase CH", loc="upper right", bbox_to_anchor=(1, 1.2))

fig.suptitle(
    "Population en phase 3+ historique\n6 régions avec historiquement les plus hauts niveaux",
    fontsize=14,
    y=0.95,
)
```

```python

```
