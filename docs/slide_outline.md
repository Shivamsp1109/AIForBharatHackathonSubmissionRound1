# Slide Outline (Use Template)

1) Title
- Explainable Inventory Risk Intelligence for Retail
- Team / name / date

2) Problem
- Stockouts and overstock drive lost revenue and locked capital
- Retailers often learn causes too late

3) Solution
- Early risk detection + plain-language explanation
- Only two risks: Stockout, Dead inventory

4) System Workflow
- Data ingestion -> Forecast baseline -> Anomaly check -> Rule-based risk -> Explanation -> Dashboard

5) Risk Rules
- Stockout: sales velocity up, inventory tight, forecast > stock
- Dead inventory: inventory high, sales stagnant, no spike expected

6) Data
- UCI Online Retail (public)
- Aggregated daily sales per product
- Synthetic inventory snapshot

7) Model Baseline
- Moving average / ARIMA baseline
- Anomaly: z-score on recent sales

8) Demo
- Product list + risk score
- Explanation panel
- Trend chart

9) Business Impact
- Prevent lost sales
- Reduce locked capital
- Faster decision making

10) Limitations + Next Steps
- Synthetic inventory
- Simple forecast baseline
- Next: integrate real inventory, add supplier lead times
