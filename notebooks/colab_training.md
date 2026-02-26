# Colab Training (Forecast Baseline)

Goal: generate `forecast.csv` with 7-day demand per product.

Copy the cells below into Google Colab.

## 1) Install dependencies
```
!pip -q install pandas statsmodels
```

## 2) Upload processed data
```
from google.colab import files
uploaded = files.upload()  # upload sales_daily.csv from data/processed
```

## 3) Load data
```
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA

sales = pd.read_csv('sales_daily.csv')
sales['date'] = pd.to_datetime(sales['date'])
sales = sales.sort_values(['product_id', 'date'])
```

## 4) Fit a simple ARIMA per product (small subset)
```
forecasts = []
max_products = 50

for i, (product_id, group) in enumerate(sales.groupby('product_id')):
    if i >= max_products:
        break
    series = group.set_index('date')['sales'].asfreq('D', fill_value=0)
    # Simple ARIMA(1,0,1) for baseline
    try:
        model = ARIMA(series, order=(1, 0, 1))
        fit = model.fit()
        pred = fit.forecast(7).sum()
    except Exception:
        pred = series.tail(7).mean() * 7
    forecasts.append({'product_id': product_id, 'forecast_next_7': round(float(pred), 2)})

forecast_df = pd.DataFrame(forecasts)
forecast_df.to_csv('forecast.csv', index=False)
forecast_df.head()
```

## 5) Download forecast.csv
```
from google.colab import files
files.download('forecast.csv')
```

Then copy `forecast.csv` into `data/processed/` locally.
