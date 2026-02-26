const h = React.createElement;

function pct(v) {
  if (v === null || v === undefined) return "-";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

function cover(v, label) {
  if (label) return label;
  if (v === null || v === undefined) return "Infinity";
  return String(v);
}

function drawLineChart(canvas, series) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  if (!series || series.length === 0) {
    ctx.fillStyle = "#9fb3b8";
    ctx.font = "12px sans-serif";
    ctx.fillText("No data", 10, 20);
    return;
  }

  const values = series.map((d) => d.sales);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  ctx.strokeStyle = "#9ad45f";
  ctx.lineWidth = 2;
  ctx.beginPath();

  series.forEach((point, index) => {
    const x = (index / (series.length - 1 || 1)) * (width - 20) + 10;
    const y = height - 20 - ((point.sales - min) / range) * (height - 40);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  ctx.fillStyle = "#9fb3b8";
  ctx.font = "10px sans-serif";
  ctx.fillText(series[0].date, 10, height - 6);
  ctx.fillText(series[series.length - 1].date, width - 80, height - 6);
}

function App() {
  const [products, setProducts] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [mode, setMode] = React.useState("normal");
  const [uploading, setUploading] = React.useState(false);
  const [uploadMessage, setUploadMessage] = React.useState("");
  const canvasRef = React.useRef(null);
  const fileRef = React.useRef(null);

  React.useEffect(() => {
    fetch("/api/v1/products")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products || []);
        if (data.products && data.products.length) {
          setSelected(data.products[0]);
        }
      })
      .catch(() => setProducts([]));
  }, []);

  React.useEffect(() => {
    if (selected && canvasRef.current) {
      drawLineChart(canvasRef.current, selected.trend || []);
    }
  }, [selected]);

  function handleUpload() {
    const file = fileRef.current && fileRef.current.files && fileRef.current.files[0];
    if (!file) {
      setUploadMessage("Please choose test.csv first.");
      return;
    }
    setUploading(true);
    setUploadMessage("");

    const form = new FormData();
    form.append("file", file);
    form.append("mode", mode);

    fetch("/api/v1/upload", {
      method: "POST",
      body: form,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setUploadMessage(data.error);
          return;
        }
        setProducts(data.products || []);
        if (data.products && data.products.length) {
          setSelected(data.products[0]);
        }
        const filename = data.filename || (mode === "demo" ? "result-demo.json" : "result-normal.json");
        const blob = new Blob([JSON.stringify({ products: data.products }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setUploadMessage(`Results ready. Downloaded ${filename}.`);
      })
      .catch(() => setUploadMessage("Upload failed."))
      .finally(() => setUploading(false));
  }

  return h(
    "div",
    null,
    h(
      "div",
      { className: "header" },
      h(
        "div",
        null,
        h("h1", null, "Inventory Risk Intelligence"),
        h("p", null, "Explainable Stockout and Dead Inventory Risk for retail teams."),
        h(
          "div",
          { style: { marginTop: "14px", display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" } },
          h("input", { type: "file", ref: fileRef, accept: ".csv" }),
          h(
            "label",
            null,
            h("input", {
              type: "radio",
              name: "mode",
              value: "normal",
              checked: mode === "normal",
              onChange: () => setMode("normal"),
            }),
            " Normal"
          ),
          h(
            "label",
            null,
            h("input", {
              type: "radio",
              name: "mode",
              value: "demo",
              checked: mode === "demo",
              onChange: () => setMode("demo"),
            }),
            " Demo Mode"
          ),
          h(
            "button",
            {
              onClick: handleUpload,
              disabled: uploading,
              style: { padding: "6px 12px", borderRadius: "8px", border: "none", background: "#9ad45f", color: "#0f1b1f", fontWeight: 600, cursor: "pointer" },
            },
            uploading ? "Uploading..." : "Run Test"
          ),
          uploadMessage ? h("span", { style: { color: "#9fb3b8" } }, uploadMessage) : null
        )
      ),
      h("div", null, h("span", { className: "badge none" }, "Demo"))
    ),
    h(
      "div",
      { className: "container" },
      h(
        "div",
        { className: "card" },
        h(
          "table",
          { className: "table" },
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              h("th", null, "Product"),
              h("th", null, "Risk"),
              h("th", null, "Score"),
              h("th", null, "Inventory")
            )
          ),
          h(
            "tbody",
            null,
            products.map((p) =>
              h(
                "tr",
                {
                  key: p.product_id,
                  onClick: () => setSelected(p),
                  style: { cursor: "pointer", background: selected && selected.product_id === p.product_id ? "rgba(154,212,95,0.08)" : "transparent" },
                },
                h("td", null, p.product_name || p.product_id),
                h("td", null, h("span", { className: `badge ${p.riskType.includes("Stockout") ? "stockout" : p.riskType.includes("Dead") ? "dead" : "none"}` }, p.riskType === "No Risk" ? "Inventory Healthy" : p.riskType)),
                h("td", { className: "risk-score" }, p.riskScore),
                h("td", null, p.inventory)
              )
            )
          )
        )
      ),
      h(
        "div",
        { className: "card" },
        selected
          ? h(
              "div",
              null,
              h("h2", null, selected.product_name || selected.product_id),
              h(
                "div",
                { className: "reason-box" },
                h("div", { className: "reason-row" }, `Risk Type: ${selected.riskType === "No Risk" ? "Inventory Healthy" : selected.riskType}`),
                h("div", { className: "reason-row" }, `Reason: ${selected.riskReason || "-"}`),
                h("div", { className: "reason-row" }, `Metrics Used: Days of Cover, Sell-through, Demand Spike`),
                h("div", { className: "reason-row" }, `Recommended Action: ${selected.riskType.includes("Stockout") ? "Replenish soon and monitor demand." : selected.riskType.includes("Dead") ? "Reduce replenishment and plan markdowns." : "Maintain current inventory policy."}`)
              ),
              h("p", { className: "explanation" }, selected.explanation),
              h("canvas", { className: "chart", ref: canvasRef, width: 520, height: 220 }),
              h(
                "div",
                { className: "metrics-grid" },
                h("div", { className: "metric" }, h("div", { className: "label" }, "Avg 7d Sales"), h("div", { className: "value" }, `${selected.avg7}`)),
                h("div", { className: "metric" }, h("div", { className: "label" }, "Forecast 7d"), h("div", { className: "value" }, `${selected.forecastNext7}`)),
                h("div", { className: "metric" }, h("div", { className: "label" }, "Days of Cover"), h("div", { className: "value" }, cover(selected.daysOfCover, selected.daysOfCoverLabel))),
                h("div", { className: "metric" }, h("div", { className: "label" }, "Sell-through 30d"), h("div", { className: "value" }, pct(selected.sellThrough30d))),
                h("div", { className: "metric" }, h("div", { className: "label" }, "Demand Trend"), h("div", { className: "value" }, selected.demandTrend || "-")),
                h("div", { className: "metric" }, h("div", { className: "label" }, "Demand Spike"), h("div", { className: "value" }, selected.demandSpike ? "Yes" : "No"))
              )
            )
          : h("p", null, "Select a product to view details.")
      )
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(h(App));
