// EMS INTELLIGENCE CORE: MEMORY + LEARNING + BUDGET + AUDIT

import { supabase } from '../lib/supabase'

// =============================
// 1. MEMORY SYSTEM
// =============================

export async function EMS_STORE_DECISION_MEMORY(decision: any, result: any) {
  await supabase.from('ai_memory').insert({
    decision_type: decision.type,
    payload: decision.payload,
    success: result.status === 'executed',
    timestamp: new Date().toISOString()
  })
}

export async function EMS_GET_MEMORY_INSIGHTS() {
  const { data } = await supabase.from('ai_memory').select('*')

  const stats: Record<string, any> = {}

  for (const row of data || []) {
    if (!stats[row.decision_type]) {
      stats[row.decision_type] = { success: 0, fail: 0 }
    }

    if (row.success) stats[row.decision_type].success++
    else stats[row.decision_type].fail++
  }

  return stats
}

// =============================
// 2. LEARNING SYSTEM
// =============================

export async function EMS_ADAPT_DECISIONS(decisions: any[]) {
  const memory = await EMS_GET_MEMORY_INSIGHTS()

  return decisions.map(d => {
    const stats = memory[d.type]

    if (!stats) return d

    const total = stats.success + stats.fail
    const successRate = total > 0 ? stats.success / total : 1

    return {
      ...d,
      confidence: d.confidence * successRate
    }
  })
}

// =============================
// 3. BUDGET CONTROL SYSTEM
// =============================

const MAX_DAILY_BUDGET = 500

export async function EMS_CHECK_BUDGET(amount: number) {
  const today = new Date().toISOString().split('T')[0]

  const { data } = await supabase
    .from('ai_spend_log')
    .select('amount')
    .eq('date', today)

  const spent = (data || []).reduce((sum, r) => sum + r.amount, 0)

  return spent + amount <= MAX_DAILY_BUDGET
}

export async function EMS_LOG_SPEND(amount: number, action: string) {
  await supabase.from('ai_spend_log').insert({
    amount,
    action,
    date: new Date().toISOString().split('T')[0]
  })
}

// =============================
// 4. AUDIT LOG SYSTEM
// =============================

export async function EMS_AUDIT_LOG(entry: any) {
  await supabase.from('ai_audit_logs').insert({
    action: entry.type,
    payload: entry.payload,
    status: entry.status,
    timestamp: new Date().toISOString()
  })
}

// =============================
// 5. SAFE EXECUTION WRAPPER
// =============================

export async function EMS_SAFE_EXECUTE(decision: any, actionFn: Function) {
  try {
    if (decision.payload?.budget) {
      const allowed = await EMS_CHECK_BUDGET(decision.payload.budget)
      if (!allowed) {
        await EMS_AUDIT_LOG({ ...decision, status: 'blocked_budget' })
        return { status: 'blocked_budget' }
      }

      await EMS_LOG_SPEND(decision.payload.budget, decision.type)
    }

    await actionFn(decision.payload)

    await EMS_STORE_DECISION_MEMORY(decision, { status: 'executed' })
    await EMS_AUDIT_LOG({ ...decision, status: 'executed' })

    return { status: 'executed' }

  } catch (err) {
    await EMS_STORE_DECISION_MEMORY(decision, { status: 'failed' })
    await EMS_AUDIT_LOG({ ...decision, status: 'failed' })

    return { status: 'failed' }
  }
}
