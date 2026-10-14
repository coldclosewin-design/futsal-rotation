(function () {
  const CATEGORY_LABELS = {
    dues: "회비", injury_exempt: "부상 면제", president_exempt: "회장 면제",
    fine_late_vote: "미투표 벌금", fine_no_show: "급불참 벌금", fine_late: "지각 벌금",
    fine_late_kickoff: "경기 후 도착 벌금", venue_fee: "구장비", snack: "간식",
    plab_support: "플랩 지원", deposit: "입금", adjustment: "조정"
  };

  function monthOf(entryDate) {
    return String(entryDate).slice(0, 7);
  }

  function memberSummary(rows, memberId, month) {
    const result = { due: 0, fine: 0, exempt: 0, refund: 0, settled: 0, outstanding: 0 };
    for (const row of rows) {
      if (row.member_id !== memberId || monthOf(row.entry_date) !== month) continue;
      const amount = Number(row.amount);
      if (row.category === "dues") result.due += amount;
      if (row.category.startsWith("fine_")) result.fine += amount;
      const exempt = ["injury_exempt", "president_exempt"].includes(row.category);
      if (exempt) result.exempt += amount;
      else if (amount < 0) result.refund += amount;
      result[row.settled ? "settled" : "outstanding"] += amount;
    }
    return result;
  }

  function teamSummary(rows, month) {
    const result = { income: 0, expense: 0, balance: 0, unpaidMembers: [] };
    const outstanding = new Map();
    for (const row of rows) {
      const amount = Number(row.amount);
      // 팀 단위 행은 정산 여부와 관계없이 반영하되, 정산된 행을 두 번 더하지 않는다.
      if (row.settled || row.member_id == null) result.balance += amount;
      if (monthOf(row.entry_date) !== month) continue;
      if (amount > 0) result.income += amount;
      else result.expense -= amount;
      if (row.member_id != null && !row.settled) {
        outstanding.set(row.member_id, (outstanding.get(row.member_id) || 0) + amount);
      }
    }
    result.unpaidMembers = Array.from(outstanding, ([member_id, amount]) => ({ member_id, outstanding: amount }))
      .filter((row) => row.outstanding > 0).sort((a, b) => a.member_id.localeCompare(b.member_id));
    return result;
  }

  function fineRow(kind, memberId, match, config) {
    const key = { no_show: "NO_SHOW", late: "LATE", late_kickoff: "LATE_KICKOFF" }[kind];
    if (!key) throw new Error("지원하지 않는 벌금 종류입니다");
    const category = `fine_${kind}`;
    return { member_id: memberId, category, amount: config.FINES[key],
      ref_match_id: match.id, entry_date: match.match_date, note: CATEGORY_LABELS[category] };
  }

  function presidentExemptRow(match, presidentId, config) {
    const monthly = config.PRESIDENT_EXEMPT_MODE === "month";
    return { member_id: presidentId, category: "president_exempt",
      amount: monthly ? -config.DUES_MONTHLY : -Math.round(config.DUES_MONTHLY / 4),
      ref_match_id: monthly ? null : match.id, entry_date: match.match_date,
      ...(monthly ? { period: monthOf(match.match_date) } : {}) };
  }

  function snackLedgerRow(claim) {
    return { member_id: claim.buyer_id, category: "snack", amount: -claim.amount,
      ref_match_id: claim.match_id, settled: false, note: claim.items };
  }

  function plabSupportAllowed(rows, memberId, month) {
    return !rows.some((row) => row.member_id === memberId && row.category === "plab_support" && monthOf(row.entry_date) === month);
  }

  const rules = { CATEGORY_LABELS, monthOf, memberSummary, teamSummary, fineRow, presidentExemptRow, snackLedgerRow, plabSupportAllowed };
  if (typeof window !== "undefined") window.ExicanLedgerRules = rules;
  if (typeof module !== "undefined" && module.exports) module.exports = rules;
})();
