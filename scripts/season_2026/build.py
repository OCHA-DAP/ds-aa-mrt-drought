# /// script
# requires-python = ">=3.11"
# dependencies = ["pandas>=2.2", "numpy", "scipy", "geopandas", "shapely>=2", "pyogrio"]
# ///
"""Build the data behind pages/season-2026/: how severe was the 2026 season in Mauritania?

Inputs (all public, downloaded by scripts/season_2026/fetch.sh into data/season_2026/raw/):
  chirps_hdx.csv          CHIRPS dekadal rainfall by wilaya (WFP on HDX), the Window 2 source
  bio_ADM1/2.csv          GeoSahel biomass (Copernicus DMP, Action contre la Faim), dekadal
  mvhi_dekad.csv          FAO ASIS weighted mean VHI, cropland, by wilaya (dekadal)
  asi_annual.csv          FAO ASIS annual Agricultural Stress Index, cropland (to 2025)
  asap_zfparc_range.csv   JRC ASAP cumulative-FPAR z-score on rangeland (pastoral vegetation)
  wb_ADM1/2.csv           GeoSahel surface water (monthly, Oct 2020 onwards)
  asap_temp_range.csv     JRC ASAP temperature (ECMWF) on the rangeland mask
  mrt_admin1/2.geojson    COD-AB v03

Every indicator is compared on the same years, 2001-2026 (the framework's analysis period, and
the first year all five series exist), with the same cut-off date in every year. Return periods
are Weibull, (n + 1) / rank, counted from the worst end (driest, least vegetation, hottest).

Writes pages/season-2026/data.json, adm1.json and adm2.json.
Run: uv run scripts/season_2026/build.py
"""

import json
import math
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from scipy import stats
from shapely.geometry import mapping
from shapely.geometry.polygon import orient

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "season_2026" / "raw"
OUT = ROOT / "pages" / "season-2026"

Y = 2026
Y0 = 2001  # common window start
YEARS = list(range(Y0, Y + 1))
REF = list(range(Y0, Y))  # 2001-2025, the reference for "% of average"
# Framework's nine worst years (Annex 1, Humanitarian Bad Years compiled by NCDP).
BAD = [2001, 2002, 2007, 2011, 2014, 2015, 2017, 2019, 2021]
SOUTH = ["MR01", "MR02", "MR03", "MR04", "MR05", "MR06", "MR09", "MR10"]
GUIDI = "MR10"
NA = [-9998.8, -9999.0, "-9998.8", "-9999.0", "-9999"]

# Name lookups for sources that do not carry COD p-codes (checked against GAUL codes in the
# HDX file: Guidimakha = GAUL 2009 = MR10 in COD-AB v03).
FAO2P = {
    "Assaba": "MR03",
    "Brakna": "MR05",
    "Gorgol": "MR04",
    "Guidimakha": "MR10",
    "Hodh Ech Chargi": "MR01",
    "Hodh El Gharbi": "MR02",
    "Tagant": "MR09",
    "Trarza": "MR06",
}
ASAP2P = {**FAO2P, "Adrar": "MR07", "Dakhlet N.": "MR08"}


def r(x, nd=1):
    return (
        None
        if x is None or (isinstance(x, float) and not math.isfinite(x))
        else round(float(x), nd)
    )


def rank_stats(s: pd.Series, worst: str) -> dict:
    """Rank and Weibull return period of every year in s (index = year), from the worst end.

    worst='low': rank 1 = smallest value. worst='high': rank 1 = largest.
    Returns {year: (rank, rp)} with n = number of non-missing years.
    """
    s = s.dropna()
    n = len(s)
    rk = s.rank(ascending=(worst == "low"), method="average")
    return {int(y): (float(rk[y]), (n + 1) / float(rk[y]), n) for y in s.index}


def summarise(s: pd.Series, worst: str, kind: str) -> dict:
    """2026 value with rank / RP on 2001-2026 and its comparison with the 2001-2025 average."""
    s = s.reindex(YEARS)
    rs = rank_stats(s, worst)
    v = s.get(Y)
    out = {"value": r(v, 3)}
    if Y in rs:
        rk, rp, n = rs[Y]
        out.update(rank=r(rk, 1), n=n, rp=r(rp, 1))
    ref = s.reindex(REF).mean()
    if kind == "ratio":
        out["pct"] = r(100 * v / ref, 0) if ref else None
    elif kind == "diff":
        out["anom"] = r(v - ref, 2)
    out["worse_years"] = sorted(
        int(y)
        for y in s.dropna().index
        if y != Y and ((s[y] < v) if worst == "low" else (s[y] > v))
    )
    return out


def detrend_ratio(s: pd.Series, fit_years) -> pd.Series:
    """Ratio to a linear (OLS) trend fitted on fit_years (as the Chad biomass trigger does)."""
    f = s.reindex(fit_years).dropna()
    b, a = np.polyfit(f.index.values, f.values, 1)
    return s / (a + b * s.index.values), b


def detrend_diff(s: pd.Series, fit_years) -> pd.Series:
    """Anomaly from a Theil-Sen trend line fitted on fit_years, the line centred on the fit mean."""
    f = s.reindex(fit_years).dropna()
    slope, _, _, _ = stats.theilslopes(f.values, f.index.values)
    line = f.mean() + slope * (s.index.values - f.index.values.mean())
    return s - line, slope


def lin_pack(s: pd.Series, nd: int) -> dict:
    """Index-type series (VHI, zFPARc): compare each year with the 2001-2025 linear trend.

    detrended = value - trend(year) + 2001-2025 mean, so it stays on the indicator's own scale.
    """
    s = s.reindex(YEARS)
    f = s.reindex(REF).dropna()
    b, a = np.polyfit(f.index.values, f.values, 1)
    det = s - (a + b * np.array(YEARS)) + f.mean()
    return {
        "detrended": summarise(det, "low", "diff"),
        "raw": summarise(s, "low", "diff"),
        "trend_per_decade": r(10 * b, 3),
        "series": {int(y): r(x, nd) for y, x in det.items()},
        "series_raw": {int(y): r(x, nd) for y, x in s.items()},
    }


# --------------------------------------------------------------------------- boundaries
def load_boundaries():
    a1 = gpd.read_file(RAW / "mrt_admin1.geojson")
    a2 = gpd.read_file(RAW / "mrt_admin2.geojson")
    names1 = dict(zip(a1.adm1_pcode, a1.adm1_name))
    names1["MR10"] = (
        "Guidimakha"  # COD spells it Guidimagha; the framework uses Guidimakha
    )
    names1["MR01"] = "Hodh Ech Chargui"
    names2 = dict(zip(a2.adm2_pcode, a2.adm2_name))
    area1 = dict(zip(a1.adm1_pcode, a1.area_sqkm))
    return a1, a2, names1, names2, area1


def geo_out(gdf, code_col, name_col, path, tol):
    feats = []
    for _, row in gdf.iterrows():
        g = row.geometry.simplify(tol, preserve_topology=True)
        polys = [g] if g.geom_type == "Polygon" else list(g.geoms)
        # d3-geo is spherical: exterior rings must be clockwise.
        polys = [orient(p, -1.0) for p in polys if p.area > tol * tol]
        geom = (
            mapping(polys[0])
            if len(polys) == 1
            else {
                "type": "MultiPolygon",
                "coordinates": [mapping(p)["coordinates"] for p in polys],
            }
        )
        geom = json.loads(
            json.dumps(geom), parse_float=lambda x: round(float(x), 3)
        )
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "code": row[code_col],
                    "name": row[name_col],
                    "adm1": row["adm1_pcode"],
                },
                "geometry": geom,
            }
        )
    path.write_text(
        json.dumps(
            {"type": "FeatureCollection", "features": feats},
            separators=(",", ":"),
        )
    )


# --------------------------------------------------------------------------- rainfall
def rainfall(area1):
    df = pd.read_csv(RAW / "chirps_hdx.csv", parse_dates=["date"])
    df = df[df.adm_level == 1].copy()
    df["year"], df["m"] = df.date.dt.year, df.date.dt.month
    df["dk"] = np.minimum(df.date.dt.day // 10 + 1, 3)
    last_final = df[df.version == "final"].date.max()
    last = df.date.max()

    def scope_dekadal(codes):
        sub = df if codes is None else df[df.PCODE.isin(codes)]
        return (
            sub.groupby("date")
            .apply(
                lambda g: np.average(g.rfh, weights=g.n_pixels),
                include_groups=False,
            )
            .rename("rfh")
        )

    scopes = {"national": None, "south": SOUTH, "guidimakha": [GUIDI]}
    out = {
        "last_final": str(last_final.date()),
        "last": str(last.date()),
        "scopes": {},
        "units": {},
        "curves": {},
        "window2": {},
    }
    for key, codes in scopes.items():
        d = scope_dekadal(codes).to_frame()
        d["year"], d["m"] = d.index.year, d.index.month
        jas = d[d.m.isin([7, 8, 9])].groupby("year").rfh.sum()
        jjaso = d[d.m.isin([6, 7, 8, 9, 10])].groupby("year").rfh.sum()
        long = jas[jas.index >= 1981]
        rs_long = rank_stats(long, "low")
        out["scopes"][key] = {
            "jas": {
                **summarise(jas, "low", "ratio"),
                "rank_long": rs_long[Y][0],
                "n_long": rs_long[Y][2],
                "rp_long": r(rs_long[Y][1]),
            },
            "jjaso": summarise(jjaso, "low", "ratio"),
            "series_jas": {int(y): r(v, 2) for y, v in jas.items() if y >= Y0},
        }
        # cumulative from 1 July, dekads Jul 1 .. Oct 21 (12 dekads)
        c = d[(d.m >= 7) & (d.m <= 10)].copy()
        c["cum"] = c.groupby("year").rfh.cumsum()
        out["curves"][key] = {
            int(y): [r(v) for v in g.cum.values]
            for y, g in c.groupby("year")
            if y >= Y0
        }
        if key == "national":
            th = [
                ((7, 2), 6.6),
                ((7, 3), 13.6),
                ((8, 1), 22.6),
                ((8, 2), 31.9),
                ((8, 3), 41.7),
            ]
            c["dk"] = np.minimum(c.index.day // 10 + 1, 3)
            w2 = {}
            for y, g in c.groupby("year"):
                if y < Y0:
                    continue
                vals = [
                    float(g[(g.m == m) & (g.dk == k)].cum.iloc[0])
                    for (m, k), _ in th
                ]
                w2[int(y)] = {
                    "cum": [r(v) for v in vals],
                    "below": [v < t for v, (_, t) in zip(vals, th)],
                }
            out["window2"] = {
                "thresholds": [t for _, t in th],
                "labels": [
                    "20 July",
                    "31 July",
                    "10 August",
                    "20 August",
                    "31 August",
                ],
                "years": w2,
                "fired": [y for y, v in w2.items() if any(v["below"])],
            }
    for code, g in df.groupby("PCODE"):
        jas = g[g.m.isin([7, 8, 9])].groupby("year").rfh.sum()
        out["units"][code] = {
            **summarise(jas, "low", "ratio"),
            "mean": r(jas.reindex(REF).mean()),
        }
    return out


def ecmwf_check():
    """July-September 2026 by wilaya in ECMWF rain (FAO ASIS) next to CHIRPS: is ECMWF drier?"""
    e = pd.read_csv(
        RAW / "ecmwf_rain_asis.csv", parse_dates=["Date"]
    ).drop_duplicates(["Province", "Date"])
    e = e[e.Date.dt.month.isin([7, 8, 9])]
    e["code"], e["year"] = e.Province.map(FAO2P), e.Date.dt.year
    ej = e.groupby(["year", "code"]).Data.sum().unstack("code")
    c = pd.read_csv(RAW / "chirps_hdx.csv", parse_dates=["date"])
    c = c[(c.adm_level == 1) & c.date.dt.month.isin([7, 8, 9])]
    cj = c.groupby([c.date.dt.year, "PCODE"]).rfh.sum().unstack("PCODE")
    out = {}
    for code in ej.columns:
        es, cs = ej[code].reindex(YEARS), cj[code].reindex(YEARS)
        out[code] = {
            "ecmwf_pct": r(100 * es[Y] / es.reindex(REF).mean(), 0),
            "chirps_pct": r(100 * cs[Y] / cs.reindex(REF).mean(), 0),
            "r": r(np.corrcoef(es.reindex(REF), cs.reindex(REF))[0, 1], 2),
        }
    return out


# --------------------------------------------------------------------------- biomass
BIO_DK = list(
    range(10, 28)
)  # dekad 10 (1 April) .. 27 (21-30 September), the last one published


def biomass_table(path):
    b = pd.read_csv(path, na_values=NA)
    code = "adm2_pcode" if "adm2_pcode" in b.columns else "adm1_pcode"
    rows = {}
    for _, row in b.iterrows():
        vals = {}
        for y in range(1999, Y + 1):
            v = [row.get(f"DMP_{y}{d:02d}", np.nan) for d in BIO_DK]
            vals[y] = np.nan if any(pd.isna(v)) else float(np.sum(v))
        rows[row[code]] = {
            "area": row.Area,
            "adm1": row.adm1_pcode,
            "cum": pd.Series(vals),
        }
    # dekadal (for the season curve)
    return rows, b, code


def biomass():
    u1, b1, _ = biomass_table(RAW / "bio_ADM1.csv")
    u2, _, _ = biomass_table(RAW / "bio_ADM2.csv")
    last_dk = max(
        int(c[-2:])
        for c in b1.columns
        if c.startswith(f"DMP_{Y}") and b1[c].notna().any()
    )
    fit = REF

    def agg(units, codes):
        sel = [units[c] for c in codes if c in units]
        w = np.array([s["area"] for s in sel])
        m = pd.concat([s["cum"] for s in sel], axis=1)
        return (m * w).sum(axis=1, min_count=len(sel)) / w.sum()

    def pack(cum):
        ratio, slope = detrend_ratio(cum, fit)
        return {
            "detrended": summarise(ratio, "low", "ratio_raw"),
            "raw": summarise(cum, "low", "ratio"),
            "trend_pct_per_decade": r(
                100 * 10 * slope / cum.reindex(fit).mean(), 1
            ),
            "series_ratio": {
                int(y): r(v, 4) for y, v in ratio.items() if y >= Y0
            },
            "series_pct": {
                int(y): r(100 * v / cum.reindex(REF).mean(), 1)
                for y, v in cum.items()
                if y >= Y0
            },
        }

    out = {
        "last_dekad": last_dk,
        "dekads": [BIO_DK[0], BIO_DK[-1]],
        "scopes": {},
        "adm1": {},
        "adm2": {},
    }
    out["scopes"]["south"] = pack(agg(u1, SOUTH))
    out["scopes"]["guidimakha"] = pack(u1[GUIDI]["cum"])
    for c in SOUTH:
        out["adm1"][c] = pack(u1[c]["cum"])
    # Saharan moughataas (under 5% of the median southern moughataa's biomass) give noisy
    # ratios; mark them arid instead of ranking them.
    means = {
        c: s["cum"].reindex(REF).mean()
        for c, s in u2.items()
        if s["adm1"] in SOUTH
    }
    med = float(np.median(list(means.values())))
    out["adm2_arid"] = sorted(c for c, m in means.items() if m < 0.05 * med)
    for c, s in u2.items():
        if s["adm1"] in SOUTH and c not in out["adm2_arid"]:
            p = pack(s["cum"])
            out["adm2"][c] = {
                k: p[k] for k in ("detrended", "raw", "trend_pct_per_decade")
            }
    # season curve (cumulative DMP from dekad 10), south and Guidimakha, all years
    curves = {}
    for key, codes in (("south", SOUTH), ("guidimakha", [GUIDI])):
        sel = b1[b1.adm1_pcode.isin(codes)]
        w = sel.Area.values
        cur = {}
        for y in range(Y0, Y + 1):
            vals = []
            for d in range(10, 37):
                col = f"DMP_{y}{d:02d}"
                v = (
                    sel[col].values
                    if col in sel
                    else np.full(len(sel), np.nan)
                )
                vals.append(
                    np.nan
                    if np.isnan(v).any()
                    else float((v * w).sum() / w.sum())
                )
            cum = np.nancumsum(vals)
            cum[np.isnan(vals)] = np.nan
            cur[y] = [r(v) for v in cum]
        curves[key] = cur
    out["curves"] = curves
    return out


# --------------------------------------------------------------------------- crop VHI / ASI
def vhi():
    v = pd.read_csv(RAW / "mvhi_dekad.csv", parse_dates=["Date"])
    v = v.drop_duplicates(["Province", "Date"], keep="last")
    v["code"] = v.Province.map(FAO2P)
    v["year"] = v.Date.dt.year
    v["md"] = v.Date.dt.month * 100 + v.Date.dt.day
    # 21 June .. 1 November, but ASIS reports each wilaya only inside its own season (11-14
    # dekads). Use, for every year, exactly the dekads that wilaya has in 2026.
    win = v[(v.md >= 621) & (v.md <= 1101)]
    parts = []
    for c, g in win.groupby("code"):
        mds = set(g[g.year == Y].md)
        g = g[g.md.isin(mds)]
        ok = g.groupby("year").md.nunique()
        parts.append(g[g.year.isin(ok[ok == len(mds)].index)])
    seas = (
        pd.concat(parts).groupby(["year", "code"]).Data.mean().unstack("code")
    )
    out = {
        "window": "21 Jun - 1 Nov",
        "last": str(v.Date.max().date()),
        "adm1": {},
        "scopes": {},
    }
    seas = seas.reindex(YEARS)
    for c in SOUTH:
        out["adm1"][c] = lin_pack(seas[c], 4)
    south = seas[SOUTH].mean(
        axis=1
    )  # unweighted: ASIS publishes no cropland area per wilaya
    out["scopes"]["south"] = lin_pack(south, 4)
    out["scopes"]["guidimakha"] = lin_pack(seas[GUIDI], 4)
    a = pd.read_csv(RAW / "asi_annual.csv")
    a = a[a.CROP_MASK == "Cropland"]
    a["code"] = a.PROVINCE.map(FAO2P).fillna(a.PROVINCE)
    asi = a.pivot_table(index="YEAR", columns="code", values="DATA")
    out["asi_official"] = {
        "last_year": int(asi.index.max()),
        "national": {
            int(y): r(x, 1) for y, x in asi["ALL"].items() if y >= Y0
        },
        "guidimakha": {
            int(y): r(x, 1) for y, x in asi[GUIDI].items() if y >= Y0
        },
    }
    # does the season-mean VHI rank years like the official ASI? (Spearman, 2001-2025, south)
    nat = asi["ALL"].reindex(REF)
    rho = stats.spearmanr(south.reindex(REF), nat).statistic
    out["rho_vhi_asi"] = r(rho, 2)
    return out


# --------------------------------------------------------------------------- pastoral
def asap_series(path):
    a = pd.read_csv(path, dtype={"date": str})
    a["code"] = a.region_name.map(ASAP2P)
    a["date"] = pd.to_datetime(a.date, format="%Y%m%d")
    return a.dropna(subset=["code"])


def pastoral(area1):
    z = asap_series(RAW / "asap_zfparc_range.csv")
    z["year"], z["md"] = z.date.dt.year, z.date.dt.month * 100 + z.date.dt.day
    # latest dekad (<= 1 Nov) with a value for every southern wilaya in every year 2001-2026
    chosen = None
    for md in (1101, 1021, 1011, 1001, 921):
        sub = z[(z.md == md) & z.code.isin(SOUTH) & z.year.isin(YEARS)]
        if sub.groupby("code").year.nunique().reindex(SOUTH).fillna(
            0
        ).min() == len(YEARS):
            chosen = md
            break
    sub = z[(z.md == chosen) & z.code.isin(SOUTH)]
    tab = sub.pivot_table(
        index="year", columns="code", values="value"
    ).reindex(YEARS)
    out = {
        "zfparc": {
            "dekad": f"{chosen // 100:02d}-{chosen % 100:02d}",
            "adm1": {},
            "scopes": {},
        }
    }
    w = np.array([area1[c] for c in SOUTH])
    south = (tab[SOUTH] * w).sum(axis=1) / w.sum()
    # zFPARc is a z-score against ASAP's whole record, which carries the greening trend.
    for key, s in (("south", south), ("guidimakha", tab[GUIDI])):
        out["zfparc"]["scopes"][key] = lin_pack(s, 4)
    for c in SOUTH:
        out["zfparc"]["adm1"][c] = lin_pack(tab[c], 4)
    out["zfparc"]["trend_z_per_decade"] = r(
        10 * np.polyfit(REF, south.reindex(REF).values, 1)[0], 2
    )

    # Surface water in October (GeoSahel), Oct 2020 onwards: too short for return periods.
    def water(path):
        wb = pd.read_csv(path, na_values=NA)
        code = "adm2_pcode" if "adm2_pcode" in wb.columns else "adm1_pcode"
        yrs = [y for y in range(2020, Y + 1) if f"WB_{y}10" in wb.columns]
        t = wb.set_index(code)[[f"WB_{y}10" for y in yrs]]
        t.columns = yrs
        return t, pd.Series(wb.adm1_pcode.values, index=wb[code].values)

    w1, _ = water(RAW / "wb_ADM1.csv")
    w2, w2adm1 = water(RAW / "wb_ADM2.csv")
    ref = [y for y in w1.columns if y < Y]
    sw = {
        "years": [int(y) for y in w1.columns],
        "ref": [int(y) for y in ref],
        "scopes": {},
        "adm1": {},
        "adm2": {},
    }
    for key, codes in (("south", SOUTH), ("guidimakha", [GUIDI])):
        s = w1.loc[codes].sum()
        sw["scopes"][key] = {
            "series": {int(y): r(v, 1) for y, v in s.items()},
            "pct": r(100 * s[Y] / s[ref].mean(), 0),
            "rank": int(s.rank(method="min")[Y]),
            "n": len(s),
        }
    for c in SOUTH:
        s = w1.loc[c]
        sw["adm1"][c] = {
            "pct": r(100 * s[Y] / s[ref].mean(), 0),
            "rank": int(s.rank(method="min")[Y]),
            "n": len(s),
            "km2": r(s[Y], 1),
        }
    for c, s in w2.iterrows():
        if (
            w2adm1[c] in SOUTH and s[ref].mean() > 0.5
        ):  # skip units with almost no open water
            sw["adm2"][c] = {
                "pct": r(100 * s[Y] / s[ref].mean(), 0),
                "rank": int(s.rank(method="min")[Y]),
                "n": len(s),
            }
    out["water"] = sw
    return out


# --------------------------------------------------------------------------- temperature
def temperature(area1):
    t = asap_series(RAW / "asap_temp_range.csv")
    t["year"], t["m"] = t.date.dt.year, t.date.dt.month
    jas = (
        t[t.m.isin([7, 8, 9])]
        .groupby(["year", "code"])
        .value.mean()
        .unstack("code")
    )
    fit = list(range(1989, Y))
    w = np.array([area1[c] for c in SOUTH])
    south = (jas[SOUTH] * w).sum(axis=1) / w.sum()
    out = {"adm1": {}, "scopes": {}}

    def pack(s):
        anom, slope = detrend_diff(s, fit)
        raw = summarise(s, "high", "diff")
        return {
            "detrended": summarise(anom, "high", "diff"),
            "raw": raw,
            "trend_c_per_decade": r(10 * slope, 2),
            "series_anom": {
                int(y): r(v, 4) for y, v in anom.items() if y >= Y0
            },
        }

    out["scopes"]["south"] = pack(south)
    out["scopes"]["guidimakha"] = pack(jas[GUIDI])
    for c in SOUTH:
        out["adm1"][c] = pack(jas[c])
    return out


# --------------------------------------------------------------------------- year table
def year_table(rain, bio, veg, past, temp):
    """Rank of every year 2001-2026 for each indicator, southern belt (Guidimakha in the second set)."""
    tables = {}
    for scope in ("south", "guidimakha"):
        series = {
            "rain": (pd.Series(rain["scopes"][scope]["series_jas"]), "low"),
            "biomass": (
                pd.Series(bio["scopes"][scope]["series_ratio"]),
                "low",
            ),
            "vhi": (pd.Series(veg["scopes"][scope]["series"]), "low"),
            "zfparc": (
                pd.Series(past["zfparc"]["scopes"][scope]["series"]),
                "low",
            ),
            "temp": (pd.Series(temp["scopes"][scope]["series_anom"]), "high"),
        }
        tab = {}
        for k, (s, worst) in series.items():
            s.index = s.index.astype(int)
            rs = rank_stats(s.reindex(YEARS), worst)
            tab[k] = {y: [r(rk, 1), r(rp, 1)] for y, (rk, rp, n) in rs.items()}
        tables[scope] = tab
    return tables


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    a1, a2, names1, names2, area1 = load_boundaries()
    rain = rainfall(area1)
    rain["ecmwf_check"] = ecmwf_check()
    bio = biomass()
    veg = vhi()
    past = pastoral(area1)
    temp = temperature(area1)
    data = {
        "year": Y,
        "years": YEARS,
        "bad_years": BAD,
        "south": SOUTH,
        "guidimakha": GUIDI,
        "names1": names1,
        "names2": names2,
        "rain": rain,
        "biomass": bio,
        "vhi": veg,
        "pastoral": past,
        "temp": temp,
        "ranks": year_table(rain, bio, veg, past, temp),
        "built": pd.Timestamp.now().strftime("%Y-%m-%d"),
    }
    (OUT / "data.json").write_text(
        json.dumps(data, separators=(",", ":"), allow_nan=False)
    )
    geo_out(a1, "adm1_pcode", "adm1_name", OUT / "adm1.json", 0.02)
    geo_out(
        a2[a2.adm1_pcode.isin(SOUTH)],
        "adm2_pcode",
        "adm2_name",
        OUT / "adm2.json",
        0.01,
    )
    for f in ("data.json", "adm1.json", "adm2.json"):
        print(f, (OUT / f).stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
