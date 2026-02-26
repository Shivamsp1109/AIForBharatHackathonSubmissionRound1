import argparse
import os
import sys

try:
    import pandas as pd
except ImportError:
    print("pandas is required. Install with: pip install pandas")
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Generate a simple 7-day forecast")
    parser.add_argument("--input", required=True, help="Path to sales_daily.csv")
    parser.add_argument("--output", required=True, help="Output forecast.csv path")
    parser.add_argument("--window", type=int, default=7, help="Moving average window")
    return parser.parse_args()


def main():
    args = parse_args()
    sales = pd.read_csv(args.input)
    sales["date"] = pd.to_datetime(sales["date"])
    sales = sales.sort_values(["product_id", "date"])

    forecasts = []
    for product_id, group in sales.groupby("product_id"):
        recent = group.tail(args.window)
        avg = recent["sales"].mean()
        forecast_next_7 = avg * 7
        forecasts.append({
            "product_id": product_id,
            "forecast_next_7": round(float(forecast_next_7), 2)
        })

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    pd.DataFrame(forecasts).to_csv(args.output, index=False)
    print(f"Saved forecast to {args.output}")


if __name__ == "__main__":
    main()
