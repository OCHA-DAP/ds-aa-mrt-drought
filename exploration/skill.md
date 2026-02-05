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

# Skill

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
from sklearn.metrics import roc_auc_score, f1_score

from src.constants import *
```

```python
blob_name = f"{PROJECT_PREFIX}/processed/cerf/mrt_drought_allocations.parquet"
df_cerf = stratus.load_parquet_from_blob(blob_name)
```

```python
blob_name = f"{PROJECT_PREFIX}/processed/asi/mrt_asi_dekadal.parquet"
df_asi = stratus.load_parquet_from_blob(blob_name)
df_asi = df_asi.rename(columns={"Year": "actual_year"})
```

```python
df_asi
```

```python
def calc_asi_year(row):
    if row["dekad_overall"] < 18 and row["dekad_overall"] > 0:
        return row["actual_year"] - 1
    else:
        return row["actual_year"]


df_asi["year"] = df_asi.apply(calc_asi_year, axis=1)
```

```python
blob_name = f"{PROJECT_PREFIX}/raw/iri/mrt_maproom_export - Sheet1.csv"
df_iri = stratus.load_csv_from_blob(blob_name)
```

```python
df_iri = df_iri.rename(columns={"Unnamed: 0": "year"})
```

```python
def emdat_float(row):
    if row["year"] == 2025:
        return np.nan
    if row["EM-DAT Bad Years"] == "Bad":
        return 1
    else:
        return 0


df_iri["emdat_float"] = df_iri.apply(emdat_float, axis=1)
```

```python
up_cols = [calendar.month_abbr[x] for x in range(1, 7)] + ["emdat_float"]
down_cols = ["Humanitarian Bad Years (rank)", "CHIRPS Precip JAS (mm)"]
all_cols = up_cols + down_cols

df_iri.set_index("year")[all_cols].style.format("{:.0f}").background_gradient(
    subset=up_cols, cmap="RdYlGn_r"
).background_gradient(subset=down_cols, cmap="RdYlGn")
```

```python
obsv_col = "CHIRPS Precip JAS (mm)"
```

```python
cols = [calendar.month_abbr[mo] for mo in range(1, 7)]
df_iri.corr(numeric_only=True)[obsv_col][cols].plot.bar()
```

```python
df_iri.corr(numeric_only=True)[obsv_col]
```

```python
df_iri.corr(numeric_only=True)[obsv_col][cols].plot()
```

```python
df_iri.corr(numeric_only=True)[obsv_col].plot.bar()
```

```python
def fill_cerf(row):
    if row["year"] < 2007:
        return np.nan
    elif pd.isna(row["Amount in US$"]):
        return 0
    else:
        return row["Amount in US$"]


df_stats = df_iri.merge(df_cerf[["year", "Amount in US$"]], how="outer")
df_stats["Amount in US$"] = df_stats.apply(fill_cerf, axis=1)
```

```python
blob_name = f"{PROJECT_PREFIX}/processed/iri_cerf_stats.parquet"
stratus.upload_parquet_to_blob(df_stats, blob_name)
```

```python
df_stats.corr(numeric_only=True)["Amount in US$"].plot.bar()
```

```python
df_stats.corr(numeric_only=True)
```

```python
# min_dekad = 6 * 3 - 2
# max_dekad = 10 * 3
min_dekad = 1
max_dekad = 36

target_cols = [
    "Humanitarian Bad Years (rank)",
    "emdat_float",
    "CHIRPS Precip JAS (mm)",
    "Amount in US$",
]

dicts = []
for dekad in range(min_dekad, max_dekad + 1):
    dff_asi = df_asi[df_asi["dekad_overall"] == dekad]
    _df_compare = dff_asi.merge(df_stats)
    _df_corr = _df_compare.corr(numeric_only=True)
    for target_col in target_cols:
        dicts.append(
            {
                "dekad": dekad,
                "corr_aoi": _df_corr[target_col]["asi_aoi"],
                "corr_all": _df_corr[target_col]["asi_all"],
                "target_col": target_col,
            }
        )

df_corr = pd.DataFrame(dicts)
```

```python
df_corr[df_corr["dekad"] == 18]
```

```python
df_corr[df_corr["dekad"] == 6]
```

```python
df_corr
```

```python
target_col_replace = {
    "Amount in US$": "Allocations CERF",
    "emdat_float": "EM-DAT (binaire)",
}
```

```python
import calendar

flip_targets = {
    "CHIRPS Precip JAS (mm)",
    "Humanitarian Bad Years (rank)",
}

# ------------------------
# Prepare plotting dataframe (same as before)
# ------------------------
df_plot = df_corr[(df_corr["dekad"] >= 18) | (df_corr["dekad"] <= 5)].copy()

df_plot["dekad_wrapped"] = df_plot["dekad"]
df_plot.loc[df_plot["dekad"] <= 5, "dekad_wrapped"] += 36

# flip correlations where needed
mask = df_plot["target_col"].isin(flip_targets)
df_plot.loc[mask, ["corr_all", "corr_aoi"]] *= -1

df_plot["target_col_rename"] = df_plot["target_col"].replace(
    target_col_replace
)

ymin = df_plot[["corr_all", "corr_aoi"]].min().min()
ymax = df_plot[["corr_all", "corr_aoi"]].max().max()


# ------------------------
# Helper: draw one panel
# ------------------------
def plot_panel(df_plot, value_col, title):
    fig, ax = plt.subplots(figsize=(11, 7), dpi=200)

    # plot each target series
    for target_col, group in df_plot.groupby("target_col_rename"):
        g = group.sort_values("dekad_wrapped")
        ax.plot(
            g["dekad_wrapped"],
            g[value_col],
            label=target_col,
        )

    # ---- mean line (black) ----
    mean_series = (
        df_plot.groupby("dekad_wrapped")[value_col].mean().sort_index()
    )

    ax.plot(
        mean_series.index,
        mean_series.values,
        color="black",
        linewidth=2.5,
        label="Moyenne",
    )

    # ------------------------
    # X ticks: dekads
    # ------------------------
    xticks = sorted(df_plot["dekad_wrapped"].unique())
    xtick_labels = [str(d - 36 if d > 36 else d) for d in xticks]

    ax.set_xticks(xticks)
    ax.set_xticklabels(xtick_labels)
    ax.set_xlim(min(xticks), max(xticks))

    ax.set_xlabel("Dékade")
    ax.set_ylabel("Corrélation")
    ax.set_title(title)

    # ------------------------
    # Month boundary lines (between dekads)
    # ------------------------
    month_boundaries = [d for d in range(3, 37, 3)]

    wrapped_bounds = []
    for d in month_boundaries:
        if d >= 18:
            wrapped_bounds.append(d)
        elif d <= 5:
            wrapped_bounds.append(d + 36)

    for xb in wrapped_bounds:
        ax.axvline(xb + 0.5, linewidth=0.6, alpha=0.25)

    # ------------------------
    # Month labels under axis
    # ------------------------
    def dekad_to_month(d):
        return ((d - 1) // 3) + 1

    dekads_shown = sorted(df_plot["dekad"].unique())
    months_shown = sorted({dekad_to_month(d) for d in dekads_shown})

    for m in months_shown:
        ds = [d for d in dekads_shown if dekad_to_month(d) == m]
        wrapped = [(d if d >= 18 else d + 36) for d in ds]
        center = sum(wrapped) / len(wrapped)

        ax.text(
            center,
            -0.05,
            calendar.month_abbr[m],
            ha="center",
            va="top",
            transform=ax.get_xaxis_transform(),
            fontsize=9,
        )

    ax.xaxis.labelpad = 18
    plt.subplots_adjust(bottom=0.18)

    # ------------------------
    # Legend outside
    # ------------------------
    ax.legend(
        loc="center left",
        bbox_to_anchor=(1.02, 0.5),
        frameon=False,
    )

    ax.set_ylim(ymin, ymax)
    ax.axhline(0, linewidth=0.5, color="k")

    fig.tight_layout()

    [ax.spines[x].set_visible(False) for x in ["top", "right"]]
    return fig, ax
```

```python
plot_panel(df_plot, "corr_all", "Correlation avec ASI dékadal (tout pays)")
```

```python
plot_panel(df_plot, "corr_aoi", "Correlation avec ASI dékadal (AOI seulement)")
```

```python
min_dekad = 21
max_dekad = 28

df_asi_limited = df_asi[
    (df_asi["dekad_overall"] >= min_dekad)
    & (df_asi["dekad_overall"] <= max_dekad)
]

df_asi_yearly = (
    df_asi_limited.groupby("year")[["asi_all", "asi_aoi"]].max().reset_index()
)
```

```python
df_stats_asi = df_stats.merge(df_asi_yearly)
```

```python
df_stats_asi
```

```python
df_stats.set_index("year").corr(numeric_only=True)
```

```python
flip_targets = {
    "CHIRPS Precip JAS (mm)",
    "Humanitarian Bad Years (rank)",
}

df_corr = df_stats_asi.set_index("year").copy()
df_corr[list(flip_targets)] *= -1

corr = df_corr.corr(numeric_only=True)

fig, ax = plt.subplots(figsize=(8, 8), dpi=200)

corr_plot = corr.copy()
np.fill_diagonal(corr_plot.values, np.nan)

cmap = plt.get_cmap("RdYlGn").copy()
cmap.set_bad(color="white")

im = ax.imshow(
    corr_plot.values,
    vmin=-1,
    vmax=1,
    cmap=cmap,
)

# ticks and labels
ax.set_xticks(np.arange(len(corr.columns)))
ax.set_yticks(np.arange(len(corr.index)))
ax.set_xticklabels(corr.columns, rotation=45, ha="right")
ax.set_yticklabels(corr.index)

# force square cells
ax.set_aspect("equal")

# grid lines
ax.set_xticks(np.arange(-0.5, len(corr.columns), 1), minor=True)
ax.set_yticks(np.arange(-0.5, len(corr.index), 1), minor=True)
ax.grid(which="minor", linestyle="-", linewidth=0.5)
ax.tick_params(which="minor", bottom=False, left=False)

# annotate values (rounded to 2 decimals)
for i in range(corr_plot.shape[0]):
    for j in range(corr_plot.shape[1]):
        val = corr_plot.iloc[i, j]
        if not np.isnan(val):
            ax.text(
                j,
                i,
                f"{val:.2f}",
                ha="center",
                va="center",
                fontsize=8,
            )

if not np.isnan(val):
    ax.text(j, i, f"{val:.2f}", ha="center", va="center", fontsize=8)

fig.colorbar(im, ax=ax, shrink=0.8)

plt.tight_layout()
```

```python
flip_targets = {
    "CHIRPS Precip JAS (mm)",
    "Humanitarian Bad Years (rank)",
}

df_scores = df_stats_asi.set_index("year").copy()

# flip so higher is always "better"
df_scores[list(flip_targets)] *= -1

# keep only numeric columns
df_scores = df_scores.select_dtypes(include="number")

# binarize: 1 if in upper quartile of that column
binary = pd.DataFrame(
    {
        col: (df_scores[col] >= df_scores[col].quantile(0.75)).astype(int)
        for col in df_scores.columns
    },
    index=df_scores.index,
)

# pairwise F1 matrix
f1_mat = pd.DataFrame(
    np.nan,
    index=binary.columns,
    columns=binary.columns,
)

for col_i in binary.columns:
    for col_j in binary.columns:
        f1_mat.loc[col_i, col_j] = f1_score(binary[col_i], binary[col_j])

# use f1_mat instead of corr in the heatmap
corr = f1_mat
```

```python
corr
```

```python
base = df_stats_asi.sort_values("year", ascending=False).set_index("year")[
    all_cols
]

styled = (
    base.style.format("{:.0f}", subset=all_cols, na_rep="")
    .background_gradient(subset=up_cols, cmap="RdYlGn_r")
    .background_gradient(subset=down_cols, cmap="RdYlGn")
    .map(
        lambda v: "background-color: white" if pd.isna(v) else "",
        subset=all_cols,
    )
)

styled
```

```python
rp_ind = 4
```

```python
thresh_obsv = df_iri[obsv_col].quantile(1 / rp_ind)
```

```python
thresh_obsv
```

```python
ymin = df_iri[obsv_col].min() * 0.9
ymax = df_iri[obsv_col].max() * 1.1

fcast_cols = [calendar.month_abbr[x] for x in range(1, 7)]


for col in fcast_cols:
    fig, ax = plt.subplots(figsize=(7, 7))
    df_iri.plot(x=col, y=obsv_col, ax=ax, linewidth=0, marker=".", color="k")
    for _, row in df_iri.iterrows():
        ax.annotate(row["year"], row[[col, obsv_col]])

    thresh_fcast = df_iri[col].quantile(1 - 1 / rp_ind)

    xmin = df_iri[col].min() * 0.9
    xmax = df_iri[col].max() * 1.1

    ax.axhline(thresh_obsv)
    ax.axhspan(ymin=ymin, ymax=thresh_obsv, alpha=0.3)

    ax.axvline(thresh_fcast)
    ax.axvspan(xmin=thresh_fcast, xmax=xmax, alpha=0.3)

    ax.set_xlim((xmin, xmax))
    ax.set_ylim((ymin, ymax))

    [ax.spines[x].set_visible(False) for x in ["top", "right"]]
```

```python

```
