import numpy as np
import pandas as pd


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
