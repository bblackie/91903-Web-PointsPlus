const drawStackDividersPlugin = {
  id: 'drawStackDividers',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const metaByIndex = {};

    chart._metasets.forEach(meta => {
      meta.data.forEach((bar, index) => {
        if (!metaByIndex[index]) metaByIndex[index] = [];
        metaByIndex[index].push(bar);
      });
    });

    Object.values(metaByIndex).forEach(stack => {
      stack.sort((a, b) => a.y - b.y);
      for (let i = 1; i < stack.length; i++) {
        const bar = stack[i];
        const { x, y, width } = bar;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x - width / 2, y);
        ctx.lineTo(x + width / 2, y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'black';
        ctx.stroke();
        ctx.restore();
      }
    });
  }
};

Chart.register(drawStackDividersPlugin, ChartDataLabels);

document.addEventListener("DOMContentLoaded", () => {
  const chartCanvas = document.getElementById("my-chart");
  let chartInstance = null;

  function fetchAndRenderChart() {
    fetch("/data/chart-data")
      .then(response => response.json())
      .then(data => {
        createChart(data, "bar");
      });
  }

  function createChart(data, type) {
    if (chartInstance) chartInstance.destroy();

    const houses = [...new Set(data.map(row => row.house))];
    const events = [...new Set(data.map(row => row.event))];

    const houseColors = {};
    data.forEach(row => {
      houseColors[row.house] = row.colour;
    });

    const datasets = events.map(event => ({
      label: event,
      data: houses.map(house => {
        const match = data.find(row => row.house === house && row.event === event);
        return match ? match.points : 0;
      }),
      backgroundColor: houses.map(house => houseColors[house] || "#999"),
      borderColor: 'black',
      borderWidth: 2,
      borderSkipped: false
    }));

    chartInstance = new Chart(chartCanvas, {
      type,
      data: {
        labels: houses,
        datasets: datasets
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false
          },
          datalabels: {
            color: 'black',
            anchor: 'center',
            align: 'center',
            font: {
              weight: 'bold',
              size: 12
            },
            formatter: (value, context) => {
              return value > 0 ? context.dataset.label : '';
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            ticks: {
              color: 'black',
            font: { weight: 'bold', size: 24 }
            }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            max: (() => {
              const useFixed = JSON.parse(localStorage.getItem('useFixedY') || 'false');
              const maxY = parseFloat(localStorage.getItem('fixedYMax'));
              return useFixed && !isNaN(maxY) ? maxY : undefined;
            })(),
              ticks: {
              color: 'black',
              font: { weight: 'bold', size: 14 }
            }
          }
        }
      },
      plugins: [drawStackDividersPlugin]
    });
  }

  if (chartCanvas) {
    fetchAndRenderChart();
  }

  const clearBtn = document.getElementById("clear-graph-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      fetch("/clear-graph", { method: "POST" })
        .then(res => res.json())
        .then(result => {
          if (result.success) {
            fetchAndRenderChart();
          } else {
            alert("Failed to clear graph data.");
          }
        });
    });
  }
});