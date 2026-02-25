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
df_dek[df_dek["obsv_target"]]
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
df_dek = df_dek.drop(columns=["thresh"]).merge(
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
df_model = df_stats_iri[df_stats_iri["year"] >= 1991].copy()
df_model["obsv_target"] = df_model["obsv_target"].astype(int)

# Center year for stability
df_model["year_c"] = df_model["year"] - df_model["year"].mean()

# Design matrix
X = sm.add_constant(df_model["year_c"])
y = df_model["obsv_target"]

# Fit logistic regression
model = sm.Logit(y, X)
result = model.fit()

print(result.summary())
```

```python
odds_ratio = np.exp(result.params["year_c"])
print("Odds ratio per year:", odds_ratio)
```

```python
next_year = df_model["year"].max() + 1
next_year_c = next_year - df_model["year"].mean()

X_next = sm.add_constant(np.array([[next_year_c]]), has_constant="add")

p_next = result.predict(X_next)[0]

print(f"Predicted probability for {next_year}: {p_next:.3f}")
```

```python
df_model["p_hat"] = result.predict(X)
df_model["rp_hat"] = 1 / df_model["p_hat"]

fig, ax = plt.subplots()

# ax.scatter(df_model["year"], df_model["obsv_target"], alpha=0.6)
ax.plot(df_model["year"], df_model["rp_hat"])

# ax.set_ylim(-0.05, 1.05)
ax.set_xlabel("Year")
ax.set_ylabel("Estimated return period")
```

```python
df_model.groupby(df_model["year"] > df_model["year"].median())[
    "obsv_target"
].mean()
```

```python
df_model.columns
```

```python
rp_model = 5

nyears_trig_model = int((len(df_model) + 1) / rp_model)
```

```python
nyears_trig_model
```

```python
for col in ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "rfh_all_cumul_rank"]:
    print(col)
    # Design matrix
    X = sm.add_constant(df_model["year_c"])
    y = df_model[col]

    # Fit logistic regression
    model = sm.OLS(y, X)
    result = model.fit()

    print(result.summary())
```

```python
col = "Jun"

thresh = df_model[col].nlargest(nyears_trig_model).min()
df_model[f"{col}_trig"] = (df_model[col] >= thresh).astype(int)
```

```python
thresh
```

```python
X = sm.add_constant(df_model["year_c"])
y = df_model[col]

# Fit logistic regression
model = sm.OLS(y, X)
result = model.fit()

print(result.summary())

# Prediction on observed data
pred = result.get_prediction(X)
pred_summary = pred.summary_frame(alpha=0.05)

df_model["y_hat"] = pred_summary["mean"]
df_model["ci_lower"] = pred_summary["mean_ci_lower"]
df_model["ci_upper"] = pred_summary["mean_ci_upper"]


fig, ax = plt.subplots()

# Raw data
df_model.plot(x="year", y=col, ax=ax, marker=".")

# Fitted line
ax.plot(df_model["year"], df_model["y_hat"])

ax.axhline(thresh, color="crimson")

# Confidence band
ax.fill_between(
    df_model["year"],
    df_model["ci_lower"],
    df_model["ci_upper"],
    alpha=0.2,
    facecolor="orange",
)

ax.set_ylim(bottom=0)
ax.set_ylabel(col)
```

```python
col = "Jun"
df_model[f"{col}_trig"] = (
    df_model[col] >= df_model[col].nlargest(nyears_trig_model).min()
)

# Design matrix
X = sm.add_constant(df_model["year_c"])
y = df_model[f"{col}_trig"]

# Fit logistic regression
model = sm.Logit(y, X)
result = model.fit()

print(result.summary())

print(np.exp(result.params["year_c"]))

# Get prediction (already on probability scale for Logit)
pred = result.get_prediction(X)
pred_summary = pred.summary_frame(alpha=0.05)

# Inspect columns if unsure:
# print(pred_summary.columns)

# These are probabilities directly
p_mean = pred_summary["predicted"]
p_lower = pred_summary["ci_lower"]
p_upper = pred_summary["ci_upper"]

# Convert to return period
df_model["rp_hat"] = 1 / p_mean

# Inversion flips bounds
df_model["rp_lower"] = 1 / p_upper
df_model["rp_upper"] = 1 / p_lower

df_model["p_hat"] = result.predict(X)
df_model["rp_hat"] = 1 / df_model["p_hat"]

fig, ax = plt.subplots()

ax.plot(df_model["year"], df_model["rp_hat"])

ax.fill_between(
    df_model["year"], df_model["rp_lower"], df_model["rp_upper"], alpha=0.2
)

ax.set_ylim((1, 1000))

ax.set_xlabel("Year")
ax.set_ylabel("Estimated return period")

fig, ax = plt.subplots()

ax.plot(df_model["year"], df_model["rp_hat"])

ax.fill_between(
    df_model["year"], df_model["rp_lower"], df_model["rp_upper"], alpha=0.2
)

ax.set_ylim((1, 10))

ax.set_xlabel("Year")
ax.set_ylabel("Estimated return period")
```

```python
df_model
```

```python
df_wf_trigs
```

```python
quantile = 0.2

for mo in range(2, 7):
    col = calendar.month_abbr[mo]

    dicts = []
    for current_year in range(1991 + 5, 2026):
        df_past = df_model[df_model["year"] < current_year]
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
    rp_eff = (current_year - 1991 + 1) / total_trigs

    fig, ax = plt.subplots()

    df_model.plot(y=col, x="year", ax=ax)
    df_wf_trigs.plot(x="current_year", y="thresh", ax=ax, color="crimson")

    ax.set_ylim(bottom=0)
    ax.set_title(f"{col}: effective RP {rp_eff:.1f} years")
```

```python

```
