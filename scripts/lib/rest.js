function redact(value, key) {
  const text = key ? String(value).split(key).join("[숨김]") : String(value);
  return text.replace(/eyJ[A-Za-z0-9_=-]*(?:\.[A-Za-z0-9_=-]+)*/g, "[숨김]");
}

function createRest({ url, key, fetchImpl = globalThis.fetch }) {
  async function request(table, query, method = "GET", rows, prefer) {
    const endpoint = new URL(`${url.replace(/\/+$/, "")}/rest/v1/${table}`);
    endpoint.search = new URLSearchParams(query).toString();
    const response = await fetchImpl(endpoint.toString(), {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {})
      },
      ...(rows === undefined ? {} : { body: JSON.stringify(rows) })
    });
    if (!response.ok) {
      throw new Error(`PostgREST ${table} 실패 (HTTP ${response.status}): ${redact(await response.text(), key).slice(0, 300)}`);
    }
    return method === "GET" ? response.json() : undefined;
  }

  async function select(table, query = {}) {
    // 기본 1,000행 제한 때문에 오래된 ledger/투표를 조용히 누락하지 않는다.
    const rows = [];
    const size = 1000;
    for (let offset = 0; ; offset += size) {
      const page = await request(table, { select: "*", ...query, limit: size, offset });
      rows.push(...page);
      if (page.length < size) return rows;
    }
  }

  async function insertIgnore(table, rows, onConflict) {
    if (!rows.length) return;
    if (!onConflict) throw new Error("중복 방지 컬럼을 지정하세요.");
    return request(table, { on_conflict: onConflict }, "POST", rows, "resolution=ignore-duplicates,return=minimal");
  }

  function update(table, match, patch) {
    if (!Object.keys(match).length) throw new Error("변경할 행의 조건을 지정하세요.");
    return request(table, match, "PATCH", patch, "return=minimal");
  }

  return { select, insertIgnore, update };
}

module.exports = { createRest, redact };
