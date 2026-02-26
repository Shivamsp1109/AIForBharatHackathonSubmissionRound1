import argparse
import os
import sys

try:
    import pandas as pd
    from statsmodels.tsa.arima.model import ARIMA
except ImportError:
    print("Required packages missing. Install with: pip install pandas statsmodels")
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Train ARIMA baseline forecast per product")
    parser.add_argument("--input", required=True, help="Path to sales_daily.csv")
    parser.add_argument("--output", required=True, help="Path to output forecast.csv")
    parser.add_argument("--max-products", type=int, default=50, help="Max products to train")
    parser.add_argument("--p", type=int, default=1, help="ARIMA p")
    parser.add_argument("--d", type=int, default=0, help="ARIMA d")
    parser.add_argument("--q", type=int, default=1, help="ARIMA q")
    return parser.parse_args()


def main():
    args = parse_args()
    sales = pd.read_csv(args.input)
    sales["date"] = pd.to_datetime(sales["date"])
    sales = sales.sort_values(["product_id", "date"])

    forecasts = []
    grouped = sales.groupby("product_id")

    for i, (product_id, group) in enumerate(grouped):
        if i >= args.max_products:
            break

        series = group.set_index("date")["sales"].asfreq("D", fill_value=0)
        try:
            model = ARIMA(series, order=(args.p, args.d, args.q))
            fit = model.fit()
            pred_next_7 = fit.forecast(7).sum()
        except Exception:
            # Keep robust fallback for unstable short series.
            pred_next_7 = series.tail(7).mean() * 7

        forecasts.append(
            {
                "product_id": product_id,
                "forecast_next_7": round(float(pred_next_7), 2),
            }
        )

    out_dir = os.path.dirname(args.output)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    pd.DataFrame(forecasts).to_csv(args.output, index=False)
    print(f"Saved forecast to {args.output}")


if __name__ == "__main__":
    main()
