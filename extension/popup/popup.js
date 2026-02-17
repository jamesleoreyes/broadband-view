const API_BASE_URL = "http://localhost:3001";

async function checkStatus() {
  const statusEl = document.getElementById("status");
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    const data = await res.json();

    if (data.status === "ok") {
      statusEl.className = "status status-ok";
      const vintage = data.data_vintage
        ? ` | Data: ${data.data_vintage}`
        : " | No data imported";
      statusEl.textContent = `API: Connected${vintage}`;
    } else {
      statusEl.className = "status status-err";
      statusEl.textContent = `API: ${data.status}`;
    }
  } catch {
    statusEl.className = "status status-err";
    statusEl.textContent = "API: Offline — start the backend server";
  }
}

checkStatus();
