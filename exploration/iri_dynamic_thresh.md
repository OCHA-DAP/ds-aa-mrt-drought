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

# IRI dynamic threshold check

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
blob_name = (
    f"{PROJECT_PREFIX}/processed/chirps/chirps_dek_season_cumul.parquet"
)
df_chirps_raw = stratus.load_parquet_from_blob(blob_name)
```

```python
df_chirps_final = df_chirps_raw[df_chirps_raw["dekad_overall"] == 27]
```

```python
df_stats_iri = df_stats_iri.merge(
    df_chirps_final[["year", "rfh_all_cumul", "rfh_aoi_cumul"]]
)
```

```python
df_stats_iri
```

```python
df_model = df_stats_iri.copy()
```

```python
start_year = 1991 + 5
```

```python
df_wf_trigs
```

```python
import matplotlib.pyplot as plt
import pandas as pd
import calendar

quantiles = sorted([0.1, 0.15, 0.2, 0.25, 0.3, 0.35])
rp_dicts = []

for mo in range(2, 7):
    col = calendar.month_abbr[mo]

    fig, ax = plt.subplots()

    # plot underlying time series WITHOUT legend entry
    ax.plot(
        df_model["year"],
        df_model[col],
        color="k",
        label="_nolegend_",  # suppress legend
    )

    thresh_results = {}
    thresh_colors = {}

    for quantile in quantiles:

        dicts = []

        for current_year in range(start_year, 2026):
            df_past = df_model[df_model["year"] <= current_year]
            if df_past.empty:
                continue

            current_row = df_model.set_index("year").loc[current_year]

            thresh = df_past[col].quantile(1 - quantile)
            trig = current_row[col] >= thresh

            dicts.append(
                {
                    "current_year": current_year,
                    "thresh": thresh,
                    "trig": trig,
                }
            )

        df_wf_trigs = pd.DataFrame(dicts)

        total_trigs = df_wf_trigs["trig"].sum()
        n_years = len(df_wf_trigs)
        rp_eff = n_years / total_trigs if total_trigs > 0 else float("inf")

        rp_dicts.append({"mo": mo, "q": quantile, "rp_eff": rp_eff})

        color = ax._get_lines.get_next_color()

        thresh_results[quantile] = df_wf_trigs
        thresh_colors[quantile] = color

        expected_rp = 1 / quantile

        ax.plot(
            df_wf_trigs["current_year"],
            df_wf_trigs["thresh"],
            color=color,
            label=(
                f"q={quantile:.2f} | "
                f"Exp RP={expected_rp:.1f}y | "
                f"Eff RP={rp_eff:.1f}y"
            ),
        )

    # ---- determine marker color (lowest quantile trigger) ----

    years = thresh_results[quantiles[0]]["current_year"]

    marker_years = []
    marker_vals = []
    marker_colors = []

    df_indexed = df_model.set_index("year")

    for year in years:
        val = df_indexed.loc[year, col]

        chosen_color = None

        for quantile in quantiles:  # lowest first
            df_q = thresh_results[quantile]
            if df_q.loc[df_q["current_year"] == year, "trig"].values[0]:
                chosen_color = thresh_colors[quantile]
                break

        if chosen_color is not None:
            marker_years.append(year)
            marker_vals.append(val)
            marker_colors.append(chosen_color)

    ax.scatter(
        marker_years,
        marker_vals,
        c=marker_colors,
        zorder=5,
    )

    ax.set_ylim(bottom=0)
    ax.set_title(f"{col}")
    ax.legend(title="Thresholds")

df_mo_rps = pd.DataFrame(rp_dicts)
```

```python
df_mo_rps["rp_nom"] = 1 / df_mo_rps["q"]
```

```python
fig, ax = plt.subplots(figsize=(7, 7))

df_mo_rps.pivot(columns="mo", values="rp_eff", index="rp_nom").plot(ax=ax)

ax.plot([0, 26], [0, 26], linestyle="--", color="grey")

ax.set_ylim(bottom=0, top=26)
ax.set_xlim(left=0, right=df_mo_rps["rp_nom"].max())

[ax.spines[x].set_visible(False) for x in ["top", "right"]]
```

```python
def highlight_trigger(val):
    if val:
        return "background-color: crimson; color: white"
    return ""
```

```python
col = "Jun"

dyn_q = 0.35
```
