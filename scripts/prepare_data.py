import argparse
import os
import sys
from datetime import datetime

try:
    import pandas as pd
except ImportError:
    print("pandas is required. Install with: pip install pandas")
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Prepare sales and inventory data")
    parser.add_argument("--input", required=True, help="Path to Online Retail CSV")
    parser.add_argument("--output", required=True, help="Output directory for processed data")
    parser.add_argument("--top-products", type=int, default=50, help="Number of top products to keep")
    return parser.parse_args()


def main():
    args = parse_args()
    os.makedirs(args.output, exist_ok=True)

    input_path = args.input.lower()
    if input_path.endswith(".xlsx") or input_path.endswith(".xls"):
        try:
            df = pd.read_excel(args.input)
        except ImportError:
            print("openpyxl is required for .xlsx files. Install with: pip install openpyxl")
            sys.exit(1)
    else:
        df = pd.read_csv(args.input, encoding="ISO-8859-1")
    expected_cols = {"date", "store", "item", "sales"}
    if not expected_cols.issubset(set(df.columns.str.lower())):
        raise ValueError("Dataset must include columns: date, store, item, sales")

    df.columns = [c.lower() for c in df.columns]
    df = df.dropna(subset=["date", "store", "item", "sales"])
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])

    df["product_id"] = df["store"].astype(int).astype(str) + "_" + df["item"].astype(int).astype(str)

    sales = (
        df.groupby(["date", "product_id"], as_index=False)["sales"]
        .sum()
        .rename(columns={"sales": "sales"})
    )

    totals = sales.groupby("product_id")["sales"].sum().reset_index()
    top_products = totals.sort_values("sales", ascending=False).head(args.top_products)["product_id"]
    sales = sales[sales["product_id"].isin(top_products)]

    catalog = (
        df[df["product_id"].isin(top_products)]
        .groupby("product_id")[["store", "item"]]
        .first()
        .reset_index()
    )
    catalog["product_name"] = catalog.apply(lambda r: f"Store {int(r['store'])} Item {int(r['item'])}", axis=1)
    catalog = catalog[["product_id", "product_name"]]

    sales["date"] = pd.to_datetime(sales["date"])
    sales = sales.sort_values(["product_id", "date"])

    inventory_snapshots = []

    for product_id, group in sales.groupby("product_id"):
        group = group.copy()
        group = group.set_index("date").asfreq("D", fill_value=0).reset_index()
        avg_daily = max(group["sales"].mean(), 1)
        inventory = max(50, int(avg_daily * 21))
        inventory_series = []

        for _, row in group.iterrows():
            inventory -= int(row["sales"])
            if inventory < avg_daily * 7:
                inventory += int(avg_daily * 14)
            inventory = max(0, inventory)
            inventory_series.append(inventory)

        group["inventory"] = inventory_series
        inventory_snapshots.append({"product_id": product_id, "inventory": inventory_series[-1]})

    sales.to_csv(os.path.join(args.output, "sales_daily.csv"), index=False)
    pd.DataFrame(inventory_snapshots).to_csv(os.path.join(args.output, "inventory_snapshot.csv"), index=False)
    catalog.to_csv(os.path.join(args.output, "product_catalog.csv"), index=False)

    print("Saved:")
    print(" - sales_daily.csv")
    print(" - inventory_snapshot.csv")
    print(" - product_catalog.csv")


if __name__ == "__main__":
    main()
