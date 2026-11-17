import type { Spread } from "./types";

export const SPREADS: Spread[] = [
  {
    id: "general",
    nameEn: "General Reading",
    nameTh: "ภาพรวมชีวิต",
    descriptionTh:
      "มองภาพรวมสถานการณ์ปัจจุบัน พลังงานรอบตัว และแนวโน้มที่กำลังก่อตัว เหมาะกับคำถามกว้างเกี่ยวกับชีวิตช่วงนี้",
    category: "general",
    cardCount: 5,
    positions: [
      { key: "present", nameTh: "สถานการณ์ปัจจุบัน", nameEn: "Present", meaningTh: "พลังงานหลักของสถานการณ์ตอนนี้" },
      { key: "challenge", nameTh: "สิ่งท้าทาย", nameEn: "Challenge", meaningTh: "อุปสรรคหรือแรงเสียดทานที่กำลังเผชิญ" },
      { key: "hidden", nameTh: "สิ่งที่ซ่อนอยู่", nameEn: "Hidden", meaningTh: "ปัจจัยเบื้องหลังที่ยังมองไม่เห็น" },
      { key: "advice", nameTh: "คำแนะนำ", nameEn: "Advice", meaningTh: "แนวทางที่ไพ่ชี้ให้ปรับใช้" },
      { key: "outcome", nameTh: "แนวโน้ม", nameEn: "Likely Direction", meaningTh: "ทิศทางที่สถานการณ์มีแนวโน้มคลี่คลาย" },
    ],
    recommendedFor: ["situation", "future_outlook", "general"],
    interpretationStrategyTh:
      "อ่านจากปัจจุบันไปสู่แนวโน้ม เน้นเชื่อมโยงสิ่งท้าทายกับคำแนะนำ ให้ภาพรวมที่สมดุลไม่ฟันธงเกินหลักฐาน",
  },
  {
    id: "celtic_cross",
    nameEn: "Celtic Cross",
    nameTh: "เซลติกครอส",
    descriptionTh:
      "สเปรดคลาสสิก 10 ใบสำหรับปัญหาซับซ้อน เจาะลึกสาเหตุ อิทธิพลรอบด้าน ความหวัง ความกลัว และผลลัพธ์",
    category: "insight",
    cardCount: 10,
    positions: [
      { key: "heart", nameTh: "หัวใจของเรื่อง", nameEn: "Heart of the Matter", meaningTh: "แก่นของสถานการณ์" },
      { key: "crossing", nameTh: "สิ่งขวางกั้น", nameEn: "Crossing", meaningTh: "แรงที่ขัดหรือท้าทายแก่นเรื่อง" },
      { key: "foundation", nameTh: "รากฐาน", nameEn: "Foundation", meaningTh: "ที่มาหรือรากของสถานการณ์" },
      { key: "past", nameTh: "อดีตที่ผ่านพ้น", nameEn: "Recent Past", meaningTh: "อิทธิพลที่กำลังจางหายไป" },
      { key: "crown", nameTh: "เป้าหมาย/ศักยภาพ", nameEn: "Crown", meaningTh: "สิ่งที่เป็นไปได้สูงสุดหรือสิ่งที่มุ่งหวัง" },
      { key: "near_future", nameTh: "อนาคตอันใกล้", nameEn: "Near Future", meaningTh: "สิ่งที่กำลังเคลื่อนเข้ามา" },
      { key: "self", nameTh: "ตัวผู้ถาม", nameEn: "Self", meaningTh: "ท่าทีและพลังของผู้ถามต่อเรื่องนี้" },
      { key: "environment", nameTh: "สภาพแวดล้อม", nameEn: "Environment", meaningTh: "ผู้คนและบรรยากาศรอบตัวที่มีผล" },
      { key: "hopes_fears", nameTh: "ความหวังและความกลัว", nameEn: "Hopes & Fears", meaningTh: "สิ่งที่ปรารถนาหรือหวั่นใจลึก ๆ" },
      { key: "outcome", nameTh: "ผลลัพธ์", nameEn: "Outcome", meaningTh: "แนวโน้มผลลัพธ์หากทุกอย่างดำเนินตามเส้นทางนี้" },
    ],
    recommendedFor: ["situation", "cause", "complex", "future_outlook"],
    interpretationStrategyTh:
      "วิเคราะห์เป็นชั้น: แก่นเรื่องกับสิ่งขวางกั้นก่อน แล้วไล่เส้นเวลา จบด้วยการชั่งน้ำหนักผลลัพธ์กับความหวังความกลัว",
  },
  {
    id: "love_relationship",
    nameEn: "Love & Relationship",
    nameTh: "ความรักและความสัมพันธ์",
    descriptionTh:
      "เจาะพลวัตความสัมพันธ์ ความรู้สึกสองฝ่าย จุดแข็ง จุดเปราะ และทิศทางที่ความสัมพันธ์กำลังมุ่งไป",
    category: "love",
    cardCount: 7,
    positions: [
      { key: "you", nameTh: "ตัวคุณ", nameEn: "You", meaningTh: "พลังงานและท่าทีของผู้ถามในความสัมพันธ์" },
      { key: "partner", nameTh: "อีกฝ่าย", nameEn: "The Other", meaningTh: "พลังงานของอีกฝ่ายที่สะท้อนผ่านไพ่" },
      { key: "connection", nameTh: "แรงเชื่อมโยง", nameEn: "Connection", meaningTh: "สิ่งที่ดึงดูดและยึดเหนี่ยวกันไว้" },
      { key: "strength", nameTh: "จุดแข็ง", nameEn: "Strength", meaningTh: "สิ่งที่หล่อเลี้ยงความสัมพันธ์" },
      { key: "friction", nameTh: "จุดเสียดทาน", nameEn: "Friction", meaningTh: "ประเด็นที่สร้างระยะห่างหรือความขัดแย้ง" },
      { key: "advice", nameTh: "คำแนะนำ", nameEn: "Advice", meaningTh: "แนวทางดูแลความสัมพันธ์" },
      { key: "direction", nameTh: "ทิศทาง", nameEn: "Direction", meaningTh: "แนวโน้มของความสัมพันธ์จากพลังงานปัจจุบัน" },
    ],
    recommendedFor: ["love", "relationship", "feelings"],
    interpretationStrategyTh:
      "อ่านไพ่ฝั่งคุณและอีกฝ่ายคู่กันเสมอ สะท้อนพลวัตโดยไม่กล่าวอ้างว่าอ่านใจอีกฝ่ายได้แน่นอน เน้นสิ่งที่ผู้ถามทำได้เอง",
  },
  {
    id: "career_wealth",
    nameEn: "Career & Wealth",
    nameTh: "การงานและการเงิน",
    descriptionTh:
      "ประเมินสถานการณ์การงานการเงิน โอกาส อุปสรรค ทรัพยากรที่มี และก้าวต่อไปที่เป็นรูปธรรม",
    category: "career",
    cardCount: 7,
    positions: [
      { key: "current", nameTh: "สถานะปัจจุบัน", nameEn: "Current State", meaningTh: "ภาพรวมการงาน/การเงินตอนนี้" },
      { key: "strengths", nameTh: "จุดแข็ง", nameEn: "Strengths", meaningTh: "ทักษะหรือทรัพยากรที่เป็นแต้มต่อ" },
      { key: "obstacle", nameTh: "อุปสรรค", nameEn: "Obstacle", meaningTh: "สิ่งที่ถ่วงหรือขวางความก้าวหน้า" },
      { key: "opportunity", nameTh: "โอกาส", nameEn: "Opportunity", meaningTh: "ช่องทางหรือจังหวะที่กำลังเปิด" },
      { key: "hidden", nameTh: "ปัจจัยแฝง", nameEn: "Hidden Factor", meaningTh: "สิ่งที่ยังมองไม่เห็นแต่มีผล" },
      { key: "advice", nameTh: "คำแนะนำ", nameEn: "Advice", meaningTh: "การกระทำที่ควรลงมือ" },
      { key: "direction", nameTh: "แนวโน้ม", nameEn: "Direction", meaningTh: "ทิศทางผลลัพธ์ในระยะข้างหน้า" },
    ],
    recommendedFor: ["career", "finance", "business", "opportunity"],
    interpretationStrategyTh:
      "เน้นแปลงสัญลักษณ์เป็นการกระทำที่จับต้องได้ ชี้โอกาสพร้อมเงื่อนไข และเตือนความเสี่ยงอย่างมีเหตุผล ไม่แนะนำการลงทุนเฉพาะเจาะจง",
  },
  {
    id: "decision",
    nameEn: "Decision Making",
    nameTh: "ชั่งใจสองทางเลือก",
    descriptionTh:
      "เปรียบเทียบทางเลือก A และ B อย่างเป็นระบบ เห็นข้อดี ความท้าทาย และสิ่งที่ใจผู้ถามต้องการจริง",
    category: "decision",
    cardCount: 7,
    positions: [
      { key: "core", nameTh: "แก่นของการตัดสินใจ", nameEn: "The Core", meaningTh: "สิ่งที่การตัดสินใจนี้เป็นเรื่องของมันจริง ๆ" },
      { key: "a_energy", nameTh: "ทางเลือก A", nameEn: "Path A", meaningTh: "พลังงานของทางเลือกแรก" },
      { key: "a_result", nameTh: "แนวโน้มของ A", nameEn: "Path A Leads To", meaningTh: "ทิศทางหากเลือกทาง A" },
      { key: "b_energy", nameTh: "ทางเลือก B", nameEn: "Path B", meaningTh: "พลังงานของทางเลือกที่สอง" },
      { key: "b_result", nameTh: "แนวโน้มของ B", nameEn: "Path B Leads To", meaningTh: "ทิศทางหากเลือกทาง B" },
      { key: "heart", nameTh: "เสียงภายใน", nameEn: "Inner Truth", meaningTh: "สิ่งที่ใจผู้ถามโน้มเอียงหรือกลัว" },
      { key: "advice", nameTh: "คำแนะนำ", nameEn: "Advice", meaningTh: "หลักคิดในการเลือกให้สอดคล้องกับตัวเอง" },
    ],
    recommendedFor: ["decision", "choice"],
    interpretationStrategyTh:
      "เทียบ A กับ B อย่างยุติธรรมทีละแกน สรุปเงื่อนไขที่แต่ละทางจะไปได้ดี และย้ำว่าการตัดสินใจสุดท้ายเป็นของผู้ถาม",
  },
  {
    id: "future_timeline",
    nameEn: "Future Timeline",
    nameTh: "เส้นเวลาอนาคต",
    descriptionTh:
      "ติดตามพัฒนาการของสถานการณ์เป็นช่วงเวลา จากรากฐานปัจจุบันสู่ระยะสั้น กลาง และไกล",
    category: "timeline",
    cardCount: 6,
    positions: [
      { key: "root", nameTh: "รากของสถานการณ์", nameEn: "Root", meaningTh: "สิ่งที่ก่อรูปสถานการณ์นี้ขึ้นมา" },
      { key: "now", nameTh: "ปัจจุบัน", nameEn: "Now", meaningTh: "จุดที่เรื่องราวยืนอยู่ตอนนี้" },
      { key: "soon", nameTh: "ระยะใกล้ (ราว 1 เดือน)", nameEn: "Near Term", meaningTh: "สิ่งที่กำลังจะคลี่ออกมาก่อน" },
      { key: "mid", nameTh: "ระยะกลาง (ราว 3 เดือน)", nameEn: "Mid Term", meaningTh: "พัฒนาการช่วงถัดไป" },
      { key: "far", nameTh: "ระยะไกล (ราว 6 เดือน)", nameEn: "Longer Term", meaningTh: "ภาพที่อาจก่อตัวในระยะยาวขึ้น" },
      { key: "advice", nameTh: "คำแนะนำตลอดเส้นทาง", nameEn: "Guiding Advice", meaningTh: "หลักที่ควรถือไว้ระหว่างทาง" },
    ],
    recommendedFor: ["timing", "future_outlook", "event"],
    interpretationStrategyTh:
      "เล่าเป็นพัฒนาการต่อเนื่อง ชี้ว่าแต่ละช่วงต่อยอดจากช่วงก่อนอย่างไร ใช้ภาษาแนวโน้ม ไม่ระบุวันเวลาแบบฟันธง",
  },
  {
    id: "yes_no",
    nameEn: "Yes / No",
    nameTh: "ใช่หรือไม่",
    descriptionTh:
      "คำถามเฉพาะเจาะจงที่ต้องการคำตอบเชิงแนวโน้ม พร้อมเหตุผลและเงื่อนไขจากไพ่สามใบ",
    category: "general",
    cardCount: 3,
    positions: [
      { key: "signal", nameTh: "สัญญาณหลัก", nameEn: "Core Signal", meaningTh: "พลังงานหลักที่ตอบคำถาม" },
      { key: "support", nameTh: "ปัจจัยหนุน", nameEn: "Supporting", meaningTh: "สิ่งที่เสริมหรือเพิ่มโอกาส" },
      { key: "against", nameTh: "ปัจจัยต้าน", nameEn: "Against", meaningTh: "เงื่อนไขหรือสิ่งที่ลดทอนโอกาส" },
    ],
    recommendedFor: ["yes_no", "opportunity"],
    interpretationStrategyTh:
      "ตอบแนวโน้ม (โน้มไปทางใช่ / ไม่ / ก้ำกึ่ง) เป็นประโยคแรก แล้วอธิบายเงื่อนไขที่ทำให้คำตอบเปลี่ยนได้ ไม่รับประกันผล",
  },
  {
    id: "hidden_factors",
    nameEn: "Hidden Factors",
    nameTh: "สิ่งที่มองไม่เห็น",
    descriptionTh:
      "ส่องปัจจัยแฝง แรงจูงใจเบื้องหลัง และจุดบอดที่ผู้ถามอาจมองข้ามในสถานการณ์",
    category: "insight",
    cardCount: 5,
    positions: [
      { key: "surface", nameTh: "สิ่งที่เห็นบนผิวน้ำ", nameEn: "Surface", meaningTh: "ภาพที่ปรากฏต่อสายตา" },
      { key: "beneath", nameTh: "ใต้ผิวน้ำ", nameEn: "Beneath", meaningTh: "กระแสที่เคลื่อนอยู่เบื้องล่าง" },
      { key: "blindspot", nameTh: "จุดบอด", nameEn: "Blind Spot", meaningTh: "สิ่งที่ผู้ถามยังไม่ทันสังเกต" },
      { key: "others", nameTh: "บทบาทของผู้อื่น", nameEn: "Others' Role", meaningTh: "อิทธิพลจากคนรอบข้าง" },
      { key: "light", nameTh: "ทางสว่าง", nameEn: "Illumination", meaningTh: "สิ่งที่จะช่วยให้เห็นความจริงชัดขึ้น" },
    ],
    recommendedFor: ["hidden", "cause", "situation"],
    interpretationStrategyTh:
      "แยกชัดระหว่างภาพบนผิวกับกระแสข้างใต้ ชี้จุดบอดอย่างนุ่มนวลแต่ตรง และเสนอวิธีตรวจสอบความจริงเพิ่ม",
  },
  {
    id: "what_to_know",
    nameEn: "What Should I Know?",
    nameTh: "สิ่งที่ควรรู้ตอนนี้",
    descriptionTh:
      "เมื่อไม่มีคำถามเฉพาะ แต่อยากรู้ว่าจักรวาลอยากบอกอะไรในช่วงเวลานี้",
    category: "general",
    cardCount: 3,
    positions: [
      { key: "message", nameTh: "สารหลัก", nameEn: "The Message", meaningTh: "สิ่งสำคัญที่สุดที่ควรรับรู้ตอนนี้" },
      { key: "why", nameTh: "เพราะอะไร", nameEn: "Why Now", meaningTh: "เหตุที่สารนี้มาถึงในช่วงนี้" },
      { key: "action", nameTh: "สิ่งที่ทำได้", nameEn: "What To Do", meaningTh: "การตอบรับสารนี้อย่างเป็นรูปธรรม" },
    ],
    recommendedFor: ["general", "advice", "situation"],
    interpretationStrategyTh: "สั้น กระชับ ลึก เน้นสารเดียวที่ชัดเจนและการนำไปใช้ทันที",
  },
  {
    id: "spiritual_growth",
    nameEn: "Spiritual Growth",
    nameTh: "การเติบโตภายใน",
    descriptionTh:
      "สำรวจบทเรียนชีวิต สิ่งที่ควรปล่อยวาง และพลังที่กำลังเติบโตในตัวผู้ถาม",
    category: "spiritual",
    cardCount: 5,
    positions: [
      { key: "soul_now", nameTh: "สภาวะภายใน", nameEn: "Inner State", meaningTh: "พลังงานภายในของผู้ถามตอนนี้" },
      { key: "lesson", nameTh: "บทเรียน", nameEn: "The Lesson", meaningTh: "สิ่งที่ชีวิตกำลังสอน" },
      { key: "release", nameTh: "สิ่งที่ควรปล่อย", nameEn: "To Release", meaningTh: "ภาระหรือความเชื่อที่ควรวางลง" },
      { key: "embrace", nameTh: "สิ่งที่ควรโอบรับ", nameEn: "To Embrace", meaningTh: "พลังหรือโอกาสที่ควรเปิดรับ" },
      { key: "becoming", nameTh: "สิ่งที่กำลังกลายเป็น", nameEn: "Becoming", meaningTh: "ตัวตนที่กำลังก่อรูปขึ้น" },
    ],
    recommendedFor: ["spiritual", "growth", "advice"],
    interpretationStrategyTh:
      "น้ำเสียงใคร่ครวญ อ่อนโยน เชื่อมบทเรียนกับชีวิตจริง ไม่ใช้ภาษาลึกลับจนจับต้องไม่ได้",
  },
  {
    id: "career_change",
    nameEn: "Career Change",
    nameTh: "เปลี่ยนงาน / เริ่มเส้นทางใหม่",
    descriptionTh:
      "ประเมินการเปลี่ยนงาน ย้ายสายงาน หรือเริ่มธุรกิจ เทียบสิ่งที่ยืนอยู่กับสิ่งที่เรียกหา",
    category: "career",
    cardCount: 7,
    positions: [
      { key: "current_path", nameTh: "เส้นทางปัจจุบัน", nameEn: "Current Path", meaningTh: "พลังงานของงานที่ทำอยู่" },
      { key: "calling", nameTh: "สิ่งที่เรียกหา", nameEn: "The Calling", meaningTh: "แรงดึงของเส้นทางใหม่" },
      { key: "fear", nameTh: "ความกังวล", nameEn: "The Fear", meaningTh: "สิ่งที่รั้งไว้หรือทำให้ลังเล" },
      { key: "asset", nameTh: "ต้นทุนที่มี", nameEn: "Your Asset", meaningTh: "ทักษะและทรัพยากรที่พกไปได้" },
      { key: "risk", nameTh: "ความเสี่ยงจริง", nameEn: "Real Risk", meaningTh: "สิ่งที่ต้องบริหารหากเปลี่ยน" },
      { key: "timing", nameTh: "จังหวะเวลา", nameEn: "Timing", meaningTh: "ความพร้อมของจังหวะปัจจุบัน" },
      { key: "advice", nameTh: "คำแนะนำ", nameEn: "Advice", meaningTh: "ก้าวที่ควรเดินต่อจากนี้" },
    ],
    recommendedFor: ["career", "decision", "change"],
    interpretationStrategyTh:
      "ชั่งเส้นทางเดิมกับเสียงเรียกใหม่อย่างเป็นธรรม แปลงความกลัวเป็นรายการที่จัดการได้ และเสนอก้าวเล็กที่ทดสอบได้จริง",
  },
  {
    id: "business_opportunity",
    nameEn: "Business Opportunity",
    nameTh: "โอกาสทางธุรกิจ",
    descriptionTh:
      "วิเคราะห์ดีลหรือไอเดียธุรกิจ ศักยภาพ อุปสรรค พันธมิตร และเงื่อนไขความสำเร็จ",
    category: "career",
    cardCount: 7,
    positions: [
      { key: "essence", nameTh: "แก่นของโอกาส", nameEn: "The Essence", meaningTh: "ธรรมชาติที่แท้ของโอกาสนี้" },
      { key: "potential", nameTh: "ศักยภาพ", nameEn: "Potential", meaningTh: "สิ่งที่โอกาสนี้อาจเติบโตเป็น" },
      { key: "weakness", nameTh: "จุดอ่อน", nameEn: "Weakness", meaningTh: "รอยร้าวหรือความเปราะบางของแผน" },
      { key: "allies", nameTh: "แรงหนุน", nameEn: "Allies", meaningTh: "คนหรือปัจจัยที่ช่วยผลักดัน" },
      { key: "obstacle", nameTh: "อุปสรรคหลัก", nameEn: "Obstacle", meaningTh: "ด่านใหญ่ที่ต้องข้าม" },
      { key: "condition", nameTh: "เงื่อนไขความสำเร็จ", nameEn: "Key Condition", meaningTh: "สิ่งที่ต้องเกิดขึ้นเพื่อให้ไปรอด" },
      { key: "direction", nameTh: "แนวโน้ม", nameEn: "Direction", meaningTh: "ทิศทางของโอกาสนี้ตามพลังงานปัจจุบัน" },
    ],
    recommendedFor: ["business", "opportunity", "decision"],
    interpretationStrategyTh:
      "วิเคราะห์แบบนักกลยุทธ์ ใช้ภาษาธุรกิจชัดเจน เตือนความเสี่ยงอย่างตรงไปตรงมา และไม่ชี้นำให้ก่อหนี้หรือลงทุนเกินตัว",
  },
  {
    id: "conflict_reconciliation",
    nameEn: "Conflict & Reconciliation",
    nameTh: "ความขัดแย้งและการคืนดี",
    descriptionTh:
      "คลี่ปมความขัดแย้ง เข้าใจมุมของแต่ละฝ่าย รากของปัญหา และสะพานสู่การคืนดี",
    category: "love",
    cardCount: 7,
    positions: [
      { key: "root", nameTh: "รากของความขัดแย้ง", nameEn: "Root", meaningTh: "จุดเริ่มที่แท้จริงของปม" },
      { key: "your_side", nameTh: "มุมของคุณ", nameEn: "Your Side", meaningTh: "ความรู้สึกและบาดแผลฝั่งผู้ถาม" },
      { key: "their_side", nameTh: "มุมของอีกฝ่าย", nameEn: "Their Side", meaningTh: "พลังงานของอีกฝ่ายที่สะท้อนผ่านไพ่" },
      { key: "misunderstanding", nameTh: "สิ่งที่เข้าใจคลาดกัน", nameEn: "Misunderstanding", meaningTh: "ช่องว่างของการสื่อสาร" },
      { key: "bridge", nameTh: "สะพานเชื่อม", nameEn: "The Bridge", meaningTh: "สิ่งที่จะพาสองฝ่ายกลับมาหากัน" },
      { key: "advice", nameTh: "คำแนะนำ", nameEn: "Advice", meaningTh: "ก้าวแรกที่ผู้ถามเริ่มได้" },
      { key: "direction", nameTh: "แนวโน้ม", nameEn: "Direction", meaningTh: "ทิศทางของความสัมพันธ์หลังจากนี้" },
    ],
    recommendedFor: ["conflict", "relationship", "love"],
    interpretationStrategyTh:
      "เป็นกลางระหว่างสองฝ่าย ไม่ตัดสินใครผิดถูก เน้นการสื่อสารและก้าวที่ผู้ถามควบคุมได้เอง",
  },
  {
    id: "monthly_forecast",
    nameEn: "Monthly Forecast",
    nameTh: "พยากรณ์รายเดือน",
    descriptionTh:
      "ภาพรวมเดือนข้างหน้า ธีมหลัก การงาน ความรัก การเงิน สิ่งที่ควรระวัง และคำแนะนำ",
    category: "forecast",
    cardCount: 6,
    positions: [
      { key: "theme", nameTh: "ธีมของเดือน", nameEn: "Theme", meaningTh: "พลังงานหลักที่ครอบเดือนนี้" },
      { key: "work", nameTh: "การงาน", nameEn: "Work", meaningTh: "แนวโน้มด้านการงาน" },
      { key: "love", nameTh: "ความรัก", nameEn: "Love", meaningTh: "แนวโน้มด้านความสัมพันธ์" },
      { key: "money", nameTh: "การเงิน", nameEn: "Money", meaningTh: "แนวโน้มด้านการเงิน" },
      { key: "caution", nameTh: "สิ่งที่ควรระวัง", nameEn: "Caution", meaningTh: "จุดที่ต้องประคับประคอง" },
      { key: "advice", nameTh: "คำแนะนำประจำเดือน", nameEn: "Advice", meaningTh: "หลักปฏิบัติของเดือนนี้" },
    ],
    recommendedFor: ["forecast", "timing", "general"],
    interpretationStrategyTh:
      "ไพ่แต่ละใบแทนธีมของด้านนั้น ไม่ใช่เหตุการณ์ที่รับประกันว่าจะเกิด เล่าเป็นภาพรวมที่นำไปวางแผนได้",
  },
  {
    id: "yearly_forecast",
    nameEn: "Yearly Forecast",
    nameTh: "พยากรณ์รายปี",
    descriptionTh:
      "มองปีข้างหน้าเป็น 12 ธีมรายเดือน เห็นจังหวะขึ้นลงและบทเรียนของทั้งปี",
    category: "forecast",
    cardCount: 12,
    positions: Array.from({ length: 12 }, (_, i) => {
      const months = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
      ];
      return {
        key: `month_${i + 1}`,
        nameTh: `เดือนที่ ${i + 1} (${months[i]})`,
        nameEn: `Month ${i + 1}`,
        meaningTh: `ธีมพลังงานของเดือนที่ ${i + 1} นับจากนี้`,
      };
    }),
    recommendedFor: ["forecast", "timing"],
    interpretationStrategyTh:
      "แต่ละใบคือธีมของเดือน ไม่ใช่คำพิพากษาเหตุการณ์ สรุปจังหวะสำคัญของปี ช่วงเร่ง ช่วงพัก และบทเรียนรวมของทั้งปี",
  },
  {
    id: "past_present_future",
    nameEn: "Past · Present · Future",
    nameTh: "อดีต ปัจจุบัน อนาคต",
    descriptionTh: "สเปรดสามใบคลาสสิก มองเส้นเรื่องจากที่มา สู่จุดที่ยืน และทิศที่กำลังไป",
    category: "timeline",
    cardCount: 3,
    positions: [
      { key: "past", nameTh: "อดีต", nameEn: "Past", meaningTh: "รากและสิ่งที่หล่อหลอมสถานการณ์" },
      { key: "present", nameTh: "ปัจจุบัน", nameEn: "Present", meaningTh: "พลังงานของจุดที่ยืนอยู่" },
      { key: "future", nameTh: "อนาคต", nameEn: "Future", meaningTh: "แนวโน้มที่กำลังก่อตัว" },
    ],
    recommendedFor: ["situation", "future_outlook", "general"],
    interpretationStrategyTh: "เล่าเป็นเส้นเรื่องเดียวต่อเนื่อง ชี้ว่าอดีตส่งผลถึงปัจจุบันและกำลังผลักไปทางไหน",
  },
];

export function getSpread(id: string): Spread | undefined {
  return SPREADS.find((s) => s.id === id);
}

export const DEFAULT_SPREAD_ID = "general";

/** Spreads currently offered. Never returns an empty catalog. */
export function enabledSpreads(disabled: readonly string[]): Spread[] {
  const list = SPREADS.filter((s) => !disabled.includes(s.id));
  return list.length > 0 ? list : SPREADS;
}

/** A sensible replacement when the preferred spread has been switched off. */
export function fallbackSpreadId(disabled: readonly string[]): string {
  const list = enabledSpreads(disabled);
  return (list.find((s) => s.id === DEFAULT_SPREAD_ID) ?? list[0]).id;
}
