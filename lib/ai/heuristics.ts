import type { QuestionAnalysis } from "./schemas";

/**
 * Keyword-based fallback classifier. Used only when the AI provider is
 * unavailable, so spread recommendation still works. It never produces a
 * reading — interpretation always requires the real AI engine.
 */
interface Rule {
  test: RegExp;
  category: QuestionAnalysis["category"];
  intent: QuestionAnalysis["intent"];
  spread: string;
  dims: string[];
}

const RULES: Rule[] = [
  { test: /(ปีนี้|ปีหน้า|ทั้งปี|รายปี|this year|next year)/i, category: "future", intent: "forecast", spread: "yearly_forecast", dims: ["ธีมรายเดือน", "จังหวะสำคัญ", "บทเรียนของปี"] },
  { test: /(เดือนนี้|เดือนหน้า|รายเดือน|this month|next month)/i, category: "future", intent: "forecast", spread: "monthly_forecast", dims: ["การงาน", "ความรัก", "การเงิน", "สิ่งที่ควรระวัง"] },
  { test: /(ทะเลาะ|คืนดี|ง้อ|ขัดแย้ง|โกรธ|เลิกคุย|ผิดใจ)/i, category: "conflict", intent: "relationship", spread: "conflict_reconciliation", dims: ["รากของปัญหา", "มุมของแต่ละฝ่าย", "ทางคืนดี"] },
  { test: /(หรือ.+ดี|ระหว่าง.+กับ|เลือก.+หรือ|ควรเลือก| or )/i, category: "decision", intent: "decision", spread: "decision", dims: ["ข้อดีของแต่ละทาง", "ความเสี่ยง", "สิ่งที่ใจต้องการ"] },
  { test: /(ลาออก|เปลี่ยนงาน|ย้ายงาน|เปลี่ยนสายงาน|งานใหม่)/i, category: "career", intent: "decision", spread: "career_change", dims: ["เส้นทางปัจจุบัน", "โอกาสใหม่", "ความเสี่ยง", "จังหวะเวลา"] },
  { test: /(ธุรกิจ|กิจการ|ลงทุน|หุ้นส่วน|ดีล|เปิดร้าน|ขายของ|startup|business)/i, category: "business", intent: "opportunity", spread: "business_opportunity", dims: ["ศักยภาพ", "จุดอ่อน", "อุปสรรค", "เงื่อนไขความสำเร็จ"] },
  { test: /(งาน|อาชีพ|เลื่อนตำแหน่ง|หัวหน้า|เงินเดือน|เงิน|รายได้|หนี้|การเงิน|career|job|money)/i, category: "career", intent: "situation", spread: "career_wealth", dims: ["สถานการณ์ปัจจุบัน", "โอกาส", "อุปสรรค", "คำแนะนำ"] },
  { test: /(รัก|แฟน|คนคุย|เขาคิด|คู่|แต่งงาน|สามี|ภรรยา|เนื้อคู่|โสด|love|crush)/i, category: "love", intent: "relationship", spread: "love_relationship", dims: ["ความรู้สึกสองฝ่าย", "จุดแข็ง", "จุดเปราะบาง", "ทิศทาง"] },
  { test: /(เมื่อไหร่|เมื่อไร|อีกนานไหม|when)/i, category: "future", intent: "timing", spread: "future_timeline", dims: ["ระยะใกล้", "ระยะกลาง", "ระยะไกล"] },
  { test: /(ทำไม|เพราะอะไร|สาเหตุ|ซ่อน|เบื้องหลัง|ปิดบัง|why)/i, category: "hidden", intent: "cause", spread: "hidden_factors", dims: ["สิ่งที่เห็น", "สิ่งที่ซ่อน", "จุดบอด"] },
  { test: /(จิตวิญญาณ|ภายใน|บทเรียน|เติบโต|ตัวตน|ปล่อยวาง|สมาธิ)/i, category: "spiritual", intent: "advice", spread: "spiritual_growth", dims: ["บทเรียน", "สิ่งที่ควรปล่อย", "สิ่งที่ควรโอบรับ"] },
  { test: /(ไหม\??$|มั้ย\??$|หรือไม่|หรือเปล่า|ได้ไหม|ใช่ไหม|จะ.+ไหม)/i, category: "yes_no", intent: "yes_no", spread: "yes_no", dims: ["สัญญาณหลัก", "ปัจจัยหนุน", "ปัจจัยต้าน"] },
];

export function heuristicAnalysis(question: string): QuestionAnalysis {
  const q = question.trim();
  const rule = RULES.find((r) => r.test.test(q));
  const short = q.length < 12;
  if (!rule) {
    return {
      category: "general",
      intent: "situation",
      time_horizon: "ช่วงปัจจุบันถึงอนาคตอันใกล้",
      dimensions: ["สถานการณ์ปัจจุบัน", "สิ่งท้าทาย", "คำแนะนำ", "แนวโน้ม"],
      understanding: `คุณต้องการมุมมองจากไพ่ต่อเรื่อง "${q.slice(0, 120)}"`,
      ambiguity_level: short ? "high" : "medium",
      clarification_question: null,
      recommended_spread: short ? "what_to_know" : "general",
      spread_reason: "คำถามค่อนข้างกว้าง จึงใช้สเปรดภาพรวมเพื่อให้เห็นทั้งสถานการณ์และแนวโน้ม",
      sensitivity: "none",
      source: "heuristic",
    };
  }
  return {
    category: rule.category,
    intent: rule.intent,
    time_horizon: "ช่วงปัจจุบันถึงอนาคตอันใกล้",
    dimensions: rule.dims,
    understanding: `คุณต้องการมุมมองจากไพ่ต่อเรื่อง "${q.slice(0, 120)}" โดยเน้น${rule.dims.slice(0, 2).join("และ")}`,
    ambiguity_level: "medium",
    clarification_question: null,
    recommended_spread: rule.spread,
    spread_reason: "เลือกจากคำสำคัญในคำถาม (โหมดสำรอง — ระบบ AI วิเคราะห์คำถามไม่พร้อมใช้งานชั่วคราว)",
    sensitivity: "none",
    source: "heuristic",
  };
}
