// Words for the resilience lab: EN, KM, TH. Numbers stay Western digits.
export const W = {};
const a = (k, en, km, th) => { W[k] = { en, km, th }; };

a('title', 'ARUN Resilience Lab', 'មន្ទីរពិសោធន៍ភាពធន់ ARUN', 'ห้องทดลองความยืดหยุ่น ARUN');
a('tagline', 'Synthetic telemetry experiments', 'ការពិសោធន៍ទូរមាត្រសំយោគ', 'การทดลองโทรมาตรสังเคราะห์');
a('scope_h', 'About this lab', 'អំពីមន្ទីរពិសោធន៍នេះ', 'เกี่ยวกับห้องทดลองนี้');
a('scope_1',
  'Fictional facilities and synthetic data. The lab measures how low-cost telemetry and local computation behave when essential civilian services are disrupted: how soon an alert arrives, what a gap hides, and what a battery and a message cost.',
  'កន្លែងប្រឌិត និងទិន្នន័យសំយោគ។ មន្ទីរពិសោធន៍នេះវាស់ថា ការវាស់ពីចម្ងាយតម្លៃទាប និងការគណនានៅមូលដ្ឋាន ដំណើរការយ៉ាងណា នៅពេលសេវាស៊ីវិលចាំបាច់ត្រូវរំខាន៖ ការជូនដំណឹងមកដល់ឆាប់ប៉ុណ្ណា គម្លាតលាក់អ្វី ហើយថ្ម និងសារមួយអស់ប៉ុន្មាន។',
  'สถานที่สมมติและข้อมูลสังเคราะห์ ห้องทดลองนี้วัดว่าโทรมาตรต้นทุนต่ำและการคำนวณในพื้นที่ทำงานอย่างไรเมื่อบริการพลเรือนที่จำเป็นถูกรบกวน: การแจ้งมาถึงเร็วแค่ไหน ช่องว่างซ่อนอะไรไว้ และแบตเตอรี่กับข้อความหนึ่งครั้งมีต้นทุนเท่าใด');
a('scope_2',
  'Each experiment generates a synthetic truth from a seed, samples it with a simulated logger, and compares what the receiver sees with what happened. The truth stays hidden until it is revealed.',
  'ការពិសោធន៍នីមួយៗបង្កើតការពិតសំយោគពីគ្រាប់ពូជ យកគំរូវាដោយឧបករណ៍កត់ត្រាក្លែងធ្វើ ហើយប្រៀបធៀបអ្វីដែលអ្នកទទួលឃើញនឹងអ្វីដែលបានកើតឡើង។ ការពិតនៅតែលាក់ រហូតដល់បង្ហាញ។',
  'การทดลองแต่ละอย่างสร้างความจริงสังเคราะห์จากค่าเริ่มต้น สุ่มอ่านด้วยตัวบันทึกจำลอง แล้วเทียบสิ่งที่ผู้รับเห็นกับสิ่งที่เกิดขึ้นจริง ความจริงถูกซ่อนไว้จนกว่าจะเปิดเผย');
a('scope_3',
  'A real pilot would be partner-led, and would start with a hazard assessment, community consultation and an independent security and privacy review.',
  'គម្រោងសាកល្បងពិតនឹងដឹកនាំដោយដៃគូ ហើយចាប់ផ្តើមដោយការវាយតម្លៃហានិភ័យ ការពិគ្រោះជាមួយសហគមន៍ និងការពិនិត្យឯករាជ្យលើសុវត្ថិភាព និងឯកជនភាព។',
  'โครงการนำร่องจริงจะนำโดยพันธมิตร และเริ่มด้วยการประเมินอันตราย การปรึกษาชุมชน และการตรวจสอบด้านความปลอดภัยและความเป็นส่วนตัวโดยผู้เชี่ยวชาญอิสระ');

// experiments
for (const [id, tab, fac, title, d] of [
  ['water', ['Water', 'ទឹក', 'น้ำ'], ['Water point A', 'ចំណុចទឹក A', 'จุดน้ำ A'], ['Water service reliability', 'ភាពអាចទុកចិត្តបាននៃសេវាទឹក', 'ความน่าเชื่อถือของบริการน้ำ'],
    ['Water point A has a tank, an outflow meter and a quality proxy. The tank level falls with demand and rises when the supply window runs. Two alerts are measured: low tank and quality proxy. A verified test is a hand-taken result that arrives later; a proxy reading is a sensor value with noise and fouling. The lab scores alert timing against synthetic events; potability is outside what it measures.',
     'ចំណុចទឹក A មានធុង ឧបករណ៍វាស់លំហូរចេញ និងប្រូកស៊ីគុណភាព។ កម្រិតធុងធ្លាក់ទៅតាមតម្រូវការ ហើយឡើងវិញពេលបង្អួចផ្គត់ផ្គង់ដំណើរការ។ ការជូនដំណឹងពីរត្រូវបានវាស់៖ ធុងទាប និងប្រូកស៊ីគុណភាព។ ការធ្វើតេស្តផ្ទៀងផ្ទាត់ជាលទ្ធផលដែលយកដោយដៃ ហើយមកដល់ក្រោយ ចំណែកការអានប្រូកស៊ីជាតម្លៃឧបករណ៍ចាប់ដែលមានសំឡេងរំខាន និងការកខ្វក់។ មន្ទីរពិសោធន៍ដាក់ពិន្ទុពេលវេលាជូនដំណឹងប្រឆាំងនឹងព្រឹត្តិការណ៍សំយោគ ចំណែកភាពអាចផឹកបាននៅក្រៅអ្វីដែលវាវាស់។',
     'จุดน้ำ A มีถัง มาตรวัดน้ำไหลออก และตัวแทนคุณภาพน้ำ ระดับถังลดลงตามความต้องการและเพิ่มขึ้นเมื่อช่วงจ่ายน้ำทำงาน วัดการแจ้งสองแบบ: ถังต่ำและตัวแทนคุณภาพ การทดสอบยืนยันคือผลที่เก็บด้วยมือและมาถึงทีหลัง ส่วนค่าตัวแทนคือค่าเซนเซอร์ที่มีสัญญาณรบกวนและการเปื้อน ห้องทดลองให้คะแนนจังหวะการแจ้งเทียบกับเหตุการณ์สังเคราะห์ ความปลอดภัยในการดื่มอยู่นอกสิ่งที่วัด']],
  ['cold', ['Cold', 'ត្រជាក់', 'เย็น'], ['Clinic cold room B', 'បន្ទប់ត្រជាក់គ្លីនិក B', 'ห้องเย็นคลินิก B'], ['Cold-chain resilience', 'ភាពធន់នៃខ្សែសង្វាក់ត្រជាក់', 'ความยืดหยุ่นของห่วงโซ่ความเย็น'],
    ['Clinic cold room B has a fictional equipment temperature series with power cuts and door openings. An excursion is time above the top of the band, 8 °C. The lab compares excursion minutes that occur with the minutes the record shows, and how the logging interval and gaps change what is detected.',
     'បន្ទប់ត្រជាក់គ្លីនិក B មានស៊េរីសីតុណ្ហភាពឧបករណ៍ប្រឌិត ដែលមានការដាច់ភ្លើង និងការបើកទ្វារ។ ការលើសកម្រិតគឺពេលវេលាដែលនៅលើកំពូលនៃចន្លោះ 8 °C។ មន្ទីរពិសោធន៍ប្រៀបធៀបនាទីលើសកម្រិតដែលកើតឡើង នឹងនាទីដែលកំណត់ត្រាបង្ហាញ និងរបៀបដែលចន្លោះពេលកត់ត្រា និងគម្លាត ផ្លាស់ប្តូរអ្វីដែលរកឃើញ។',
     'ห้องเย็นคลินิก B มีชุดอุณหภูมิของอุปกรณ์สมมติ พร้อมไฟดับและการเปิดประตู เหตุเกินช่วงคือเวลาที่อยู่เหนือขอบบนของช่วง 8 °C ห้องทดลองเทียบนาทีที่เกินจริงกับนาทีที่บันทึกแสดง และดูว่าช่วงเวลาบันทึกและช่องว่างเปลี่ยนสิ่งที่ตรวจพบอย่างไร']],
  ['power', ['Power', 'ភ្លើង', 'ไฟ'], ['Pump house C', 'ផ្ទះស្នប់ C', 'อาคารสูบน้ำ C'], ['Power reliability', 'ភាពអាចទុកចិត្តបាននៃអគ្គិសនី', 'ความน่าเชื่อถือของไฟฟ้า'],
    ['Pump house C has a mains status signal and a device health index that declines with age and with each outage. The lab measures availability as the record estimates it, data gaps, and the lead time of a health alert.',
     'ផ្ទះស្នប់ C មានសញ្ញាស្ថានភាពភ្លើងបណ្តាញ និងសន្ទស្សន៍សុខភាពឧបករណ៍ ដែលធ្លាក់ទៅតាមអាយុ និងការដាច់ភ្លើងនីមួយៗ។ មន្ទីរពិសោធន៍វាស់ភាពមានដែលកំណត់ត្រាប៉ាន់ស្មាន គម្លាតទិន្នន័យ និងពេលជូនដំណឹងមុននៃការជូនដំណឹងសុខភាព។',
     'อาคารสูบน้ำ C มีสัญญาณสถานะไฟหลักและดัชนีสุขภาพของอุปกรณ์ที่ลดลงตามอายุและทุกครั้งที่ไฟดับ ห้องทดลองวัดความพร้อมใช้งานตามที่บันทึกประมาณไว้ ช่องว่างของข้อมูล และเวลานำของการแจ้งสุขภาพ']],
  ['env', ['Air', 'ខ្យល់', 'อากาศ'], ['Air station D', 'ស្ថានីខ្យល់ D', 'สถานีอากาศ D'], ['Environmental monitoring', 'ការតាមដានបរិស្ថាន', 'การติดตามสิ่งแวดล้อม'],
    ['Air station D has heat, humidity and a particulate-style index. Heat and air alerts are scored against synthetic heat spells and haze episodes.',
     'ស្ថានីខ្យល់ D មានកម្តៅ សំណើម និងសន្ទស្សន៍ប្រភេទភាគល្អិត។ ការជូនដំណឹងកម្តៅ និងខ្យល់ត្រូវបានដាក់ពិន្ទុប្រឆាំងនឹងរលកកម្តៅ និងអំឡុងអ័ព្ទសំយោគ។',
     'สถานีอากาศ D มีความร้อน ความชื้น และดัชนีแบบฝุ่นละออง การแจ้งความร้อนและอากาศให้คะแนนเทียบกับช่วงอากาศร้อนและช่วงหมอกควันสังเคราะห์']],
  ['conn', ['Link', 'ការតភ្ជាប់', 'สัญญาณ'], ['Tank station E', 'ស្ថានីធុងទឹក E', 'สถานีถังน้ำ E'], ['Missing connectivity', 'ការតភ្ជាប់ដែលបាត់', 'การเชื่อมต่อที่ขาดหาย'],
    ['Tank station E logs a tank level and runs in one of three modes: local only with periodic record pickup, direct uplink, or store-and-forward uplink. The tank follows its own supply and demand, so shortage minutes match across the three modes. Delivery changes when, and whether, the receiver learns of the shortage, and what the device spends to say so.',
     'ស្ថានីធុងទឹក E កត់ត្រាកម្រិតធុង ហើយដំណើរការតាមមួយក្នុងបីរបៀប៖ នៅមូលដ្ឋានតែប៉ុណ្ណោះជាមួយការយកកំណត់ត្រាតាមកាលកំណត់ ផ្ញើដោយផ្ទាល់ ឬរក្សាទុកហើយបញ្ជូន។ ធុងទឹកធ្វើតាមការផ្គត់ផ្គង់ និងតម្រូវការរបស់ខ្លួន ដូច្នេះនាទីខ្វះខាតដូចគ្នាក្នុងបីរបៀប។ ការបញ្ជូនផ្លាស់ប្តូរពេលវេលា និងថាតើអ្នកទទួលដឹងពីការខ្វះខាតឬអត់ និងអ្វីដែលឧបករណ៍ចំណាយដើម្បីប្រាប់។',
     'สถานีถังน้ำ E บันทึกระดับถังและทำงานในหนึ่งในสามโหมด: ในพื้นที่อย่างเดียวพร้อมการเก็บบันทึกเป็นรอบ ส่งตรง หรือเก็บแล้วส่งต่อ ถังน้ำเป็นไปตามอุปทานและอุปสงค์ของตัวเอง นาทีที่ขาดน้ำจึงเท่ากันทั้งสามโหมด การส่งข้อมูลเปลี่ยนว่าผู้รับรู้เมื่อไรและรู้หรือไม่ และอุปกรณ์ใช้อะไรไปเพื่อแจ้ง']],
]) {
  a('tab_' + id, ...tab); a('f_' + id, ...fac); a('x_' + id, ...title); a('d_' + id, ...d);
}

// controls
a('hint', 'A change reruns the same seed.', 'ការផ្លាស់ប្តូរមួយ រត់ឡើងវិញដោយប្រើគ្រាប់ពូជដដែល។', 'การเปลี่ยนค่าจะรันซ้ำด้วยค่าเริ่มต้นเดิม');
a('controls', 'Controls', 'ការគ្រប់គ្រង', 'ตัวควบคุม');
a('c_interval', 'Logger interval', 'ចន្លោះពេលកត់ត្រា', 'ช่วงเวลาบันทึก');
a('c_linkKind', 'Link outage pattern', 'គំរូដាច់ការតភ្ជាប់', 'รูปแบบสัญญาณขาด');
a('c_linkLen', 'Link outage length', 'រយៈពេលដាច់ការតភ្ជាប់', 'ความยาวช่วงสัญญาณขาด');
a('c_battery', 'Battery size (assumed)', 'ទំហំថ្ម (សន្មត់)', 'ขนาดแบตเตอรี่ (สมมติ)');
a('c_sf', 'Store-and-forward', 'រក្សាទុកហើយបញ្ជូន', 'เก็บแล้วส่งต่อ');
a('c_mode', 'Delivery mode', 'របៀបបញ្ជូន', 'โหมดการส่ง');
a('mode_local', 'Local only', 'នៅមូលដ្ឋានតែប៉ុណ្ណោះ', 'ในพื้นที่อย่างเดียว');
a('mode_direct', 'Direct', 'ផ្ទាល់', 'ส่งตรง');
a('mode_sf', 'Store-and-forward', 'រក្សាទុកហើយបញ្ជូន', 'เก็บแล้วส่งต่อ');
a('c_local', 'Alert on the device', 'ជូនដំណឹងនៅលើឧបករណ៍', 'แจ้งที่ตัวอุปกรณ์');
a('c_thr_water', 'Low-tank alert level', 'កម្រិតជូនដំណឹងធុងទាប', 'ระดับแจ้งถังต่ำ');
a('c_thr2_water', 'Quality proxy alert level', 'កម្រិតជូនដំណឹងប្រូកស៊ីគុណភាព', 'ระดับแจ้งตัวแทนคุณภาพ');
a('c_verified', 'Verified test every', 'តេស្តផ្ទៀងផ្ទាត់រៀងរាល់', 'ทดสอบยืนยันทุก');
a('c_thr_cold', 'Alert above', 'ជូនដំណឹងពេលលើស', 'แจ้งเมื่อสูงกว่า');
a('c_cutKind', 'Power cut pattern', 'គំរូដាច់ភ្លើង', 'รูปแบบไฟดับ');
a('c_cutLen', 'Power cut length', 'រយៈពេលដាច់ភ្លើង', 'ความยาวช่วงไฟดับ');
a('c_thr_power', 'Health alert level', 'កម្រិតជូនដំណឹងសុខភាព', 'ระดับแจ้งสุขภาพ');
a('c_outKind', 'Mains outage pattern', 'គំរូដាច់ភ្លើងបណ្តាញ', 'รูปแบบไฟหลักดับ');
a('c_outLen', 'Mains outage length', 'រយៈពេលដាច់ភ្លើងបណ្តាញ', 'ความยาวช่วงไฟหลักดับ');
a('c_thr_env', 'Heat alert level', 'កម្រិតជូនដំណឹងកម្តៅ', 'ระดับแจ้งความร้อน');
a('c_thr2_env', 'Air index alert level', 'កម្រិតជូនដំណឹងសន្ទស្សន៍ខ្យល់', 'ระดับแจ้งดัชนีอากาศ');
a('c_thr_conn', 'Low-tank alert level', 'កម្រិតជូនដំណឹងធុងទាប', 'ระดับแจ้งถังต่ำ');
a('c_pickup', 'Record pickup every (assumed)', 'យកកំណត់ត្រារៀងរាល់ (សន្មត់)', 'เก็บบันทึกทุก (สมมติ)');
a('k_none', 'None', 'គ្មាន', 'ไม่มี');
a('k_scattered', 'Scattered', 'ខ្ចាត់ខ្ចាយ', 'กระจาย');
a('k_single', 'One long', 'មួយយូរ', 'ครั้งเดียวยาว');
a('k_daily', 'Daily', 'ប្រចាំថ្ងៃ', 'รายวัน');
a('on', 'On', 'បើក', 'เปิด');
a('off', 'Off', 'បិទ', 'ปิด');
a('c_seed', 'Seed', 'គ្រាប់ពូជ', 'ค่าเริ่มต้นสุ่ม');
a('c_next', 'Next seed', 'គ្រាប់ពូជបន្ទាប់', 'ค่าถัดไป');
a('u_min', 'min', 'នាទី', 'นาที');
a('u_h', 'h', 'ម៉ោង', 'ชม.');
a('u_d', 'd', 'ថ្ងៃ', 'วัน');
a('u_mah', 'mAh', 'mAh', 'mAh');
a('u_cost', 'cost units', 'ឯកតាថ្លៃ', 'หน่วยต้นทุน');

// replay and reveal
a('r_play', 'Play', 'ចាក់', 'เล่น');
a('r_pause', 'Pause', 'ផ្អាក', 'หยุดชั่วคราว');
a('r_time', 'Replay time', 'ពេលវេលាចាក់ឡើងវិញ', 'เวลาในการเล่นซ้ำ');
a('r_day', 'Day {d}, {hh}:{mm}', 'ថ្ងៃទី {d} {hh}:{mm}', 'วันที่ {d} {hh}:{mm}');
a('reveal', 'Reveal truth', 'បង្ហាញការពិត', 'เปิดเผยความจริง');
a('hide', 'Hide truth', 'លាក់ការពិត', 'ซ่อนความจริง');
a('lang', 'Language', 'ភាសា', 'ภาษา');

// legend
a('l_received', 'Received reading', 'ការអានដែលបានទទួល', 'ค่าที่ได้รับ');
a('l_pending', 'Logged on the device, not received', 'កត់ត្រានៅលើឧបករណ៍ មិនទាន់ទទួល', 'บันทึกในอุปกรณ์ ยังไม่ได้รับ');
a('l_alert', 'Alert', 'ការជូនដំណឹង', 'การแจ้ง');
a('l_truth', 'Synthetic truth', 'ការពិតសំយោគ', 'ความจริงสังเคราะห์');
a('l_event', 'Event in the truth', 'ព្រឹត្តិការណ៍ក្នុងការពិត', 'เหตุการณ์ในความจริง');
a('l_link', 'No link', 'គ្មានការតភ្ជាប់', 'ไม่มีสัญญาณ');
a('l_thr', 'Alert level', 'កម្រិតជូនដំណឹង', 'ระดับแจ้ง');
a('l_vpos', 'Verified test, positive', 'តេស្តផ្ទៀងផ្ទាត់ វិជ្ជមាន', 'ผลทดสอบยืนยัน พบ');
a('l_vneg', 'Verified test, negative', 'តេស្តផ្ទៀងផ្ទាត់ អវិជ្ជមាន', 'ผลทดสอบยืนยัน ไม่พบ');
a('t_proxy', 'Proxy reading: a sensor value, not a verified test', 'ការអានប្រូកស៊ី៖ តម្លៃឧបករណ៍ចាប់ មិនមែនតេស្តផ្ទៀងផ្ទាត់', 'ค่าตัวแทน: ค่าเซนเซอร์ ไม่ใช่การทดสอบยืนยัน');
a('t_direct', 'Direct reading', 'ការអានផ្ទាល់', 'ค่าที่วัดโดยตรง');
a('ch_tank', 'Tank level', 'កម្រិតធុង', 'ระดับถัง');
a('ch_flow', 'Outflow', 'លំហូរចេញ', 'น้ำไหลออก');
a('ch_proxy', 'Quality proxy', 'ប្រូកស៊ីគុណភាព', 'ตัวแทนคุณภาพ');
a('ch_temp', 'Equipment temperature', 'សីតុណ្ហភាពឧបករណ៍', 'อุณหภูมิอุปกรณ์');
a('ch_mains', 'Mains status', 'ស្ថានភាពភ្លើងបណ្តាញ', 'สถานะไฟหลัก');
a('ch_health', 'Device health', 'សុខភាពឧបករណ៍', 'สุขภาพอุปกรณ์');
a('ch_heat', 'Heat', 'កម្តៅ', 'ความร้อน');
a('ch_hum', 'Humidity', 'សំណើម', 'ความชื้น');
a('ch_air', 'Air particulate index', 'សន្ទស្សន៍ភាគល្អិតក្នុងខ្យល់', 'ดัชนีฝุ่นละอองในอากาศ');
a('chart_label', 'Chart: {name}', 'គំនូសតាង៖ {name}', 'แผนภูมิ: {name}');
a('day', 'day', 'ថ្ងៃ', 'วัน');

// panels
a('p_obs', 'What the receiver sees', 'អ្វីដែលអ្នកទទួលឃើញ', 'สิ่งที่ผู้รับเห็น');
a('p_truth', 'Against the truth', 'ប្រៀបធៀបនឹងការពិត', 'เทียบกับความจริง');
a('p_locked', 'Results against the truth appear after Reveal truth.', 'លទ្ធផលប្រៀបធៀបនឹងការពិត បង្ហាញក្រោយពេលបង្ហាញការពិត។', 'ผลเทียบกับความจริงจะแสดงหลังเปิดเผยความจริง');
a('p_dist', 'Over {n} seeds: median, 10th to 90th percentile; this seed is the dot.', 'លើគ្រាប់ពូជ {n}៖ មធ្យមភាគ ភាគរយទី 10 ដល់ទី 90 ហើយចំណុចគឺគ្រាប់ពូជនេះ។', 'จาก {n} ค่าเริ่มต้น: มัธยฐาน เปอร์เซ็นไทล์ที่ 10 ถึง 90 และจุดคือค่าเริ่มต้นนี้');
a('p_assume', 'Assumed values', 'តម្លៃសន្មត់', 'ค่าที่สมมติ');
a('p_assume_note', 'These are assumptions entered by the user, not measurements.', 'ទាំងនេះជាការសន្មត់ដែលអ្នកប្រើបញ្ចូល មិនមែនការវាស់ទេ។', 'ค่าเหล่านี้เป็นข้อสมมติที่ผู้ใช้ป้อน ไม่ใช่ผลการวัด');
a('a_sleep', 'Idle draw, mA', 'ចរន្តស្ងប់ mA', 'กระแสขณะพัก mA');
a('a_sample', 'Energy per reading, mAh', 'ថាមពលក្នុងមួយការអាន mAh', 'พลังงานต่อการอ่าน mAh');
a('a_msg', 'Energy per message, mAh', 'ថាមពលក្នុងមួយសារ mAh', 'พลังงานต่อข้อความ mAh');
a('a_cmsg', 'Cost per message', 'ថ្លៃក្នុងមួយសារ', 'ต้นทุนต่อข้อความ');
a('a_cvisit', 'Cost per record pickup', 'ថ្លៃក្នុងមួយការយកកំណត់ត្រា', 'ต้นทุนต่อการเก็บบันทึก');
a('a_cswap', 'Cost per battery swap', 'ថ្លៃក្នុងមួយការប្តូរថ្ម', 'ต้นทุนต่อการเปลี่ยนแบตเตอรี่');
a('a_tag', 'assumed', 'សន្មត់', 'สมมติ');
a('cmp_h', 'Three delivery modes, same seed', 'របៀបបញ្ជូនបី គ្រាប់ពូជដូចគ្នា', 'สามโหมดการส่ง ค่าเริ่มต้นเดียวกัน');
a('cmp_note', 'Each cell shows this seed; the line beneath shows the median over the seeds.', 'ក្រឡានីមួយៗបង្ហាញគ្រាប់ពូជនេះ ហើយបន្ទាត់ខាងក្រោមបង្ហាញមធ្យមភាគលើគ្រាប់ពូជ។', 'แต่ละช่องแสดงค่าเริ่มต้นนี้ และบรรทัดล่างแสดงมัธยฐานจากหลายค่าเริ่มต้น');
a('median', 'median', 'មធ្យមភាគ', 'มัธยฐาน');
a('this_seed', 'this seed', 'គ្រាប់ពូជនេះ', 'ค่าเริ่มต้นนี้');
a('none_val', 'none', 'គ្មាន', 'ไม่มี');
a('now', 'Now', 'ឥឡូវ', 'ตอนนี้');
a('stale_now', 'Age of newest reading now', 'អាយុនៃការអានថ្មីបំផុតឥឡូវ', 'อายุของค่าล่าสุดตอนนี้');
a('alerts_now', 'Alerts so far', 'ការជូនដំណឹងរហូតមកដល់ឥឡូវ', 'การแจ้งจนถึงตอนนี้');

// metrics
const M = {
  completeness: ['Readings received', 'ការអានដែលបានទទួល', 'ค่าที่ได้รับ'],
  device: ['Readings logged on the device', 'ការអានដែលកត់ត្រានៅលើឧបករណ៍', 'ค่าที่บันทึกในอุปกรณ์'],
  delay_mean: ['Mean delivery delay', 'ការពន្យាពេលបញ្ជូនមធ្យម', 'ความล่าช้าในการส่งเฉลี่ย'],
  stale_mean: ['Staleness, mean', 'ភាពចាស់ មធ្យម', 'ความเก่าของข้อมูล เฉลี่ย'],
  stale_p95: ['Staleness, 95th percentile', 'ភាពចាស់ ភាគរយទី 95', 'ความเก่าของข้อมูล เปอร์เซ็นไทล์ที่ 95'],
  stale_max: ['Staleness, longest', 'ភាពចាស់ វែងបំផុត', 'ความเก่าของข้อมูล นานที่สุด'],
  gaps: ['Gaps in the record', 'គម្លាតក្នុងកំណត់ត្រា', 'ช่องว่างในบันทึก'],
  gap_min: ['Gap minutes', 'នាទីគម្លាត', 'นาทีของช่องว่าง'],
  energy_day: ['Energy per day', 'ថាមពលក្នុងមួយថ្ងៃ', 'พลังงานต่อวัน'],
  life_days: ['Battery life', 'អាយុកាលថ្ម', 'อายุแบตเตอรี่'],
  swaps_month: ['Battery swaps per month', 'ការប្តូរថ្មក្នុងមួយខែ', 'การเปลี่ยนแบตเตอรี่ต่อเดือน'],
  msgs_month: ['Messages per month', 'សារក្នុងមួយខែ', 'ข้อความต่อเดือน'],
  visits_month: ['Pickups per month', 'ការយកកំណត់ត្រាក្នុងមួយខែ', 'การเก็บบันทึกต่อเดือน'],
  cost_month: ['Cost per month (assumed)', 'ថ្លៃក្នុងមួយខែ (សន្មត់)', 'ต้นทุนต่อเดือน (สมมติ)'],
  dead_day: ['Battery ends on day', 'ថ្មអស់នៅថ្ងៃទី', 'แบตเตอรี่หมดในวันที่'],
  events: ['Events in the truth', 'ព្រឹត្តិការណ៍ក្នុងការពិត', 'เหตุการณ์ในความจริง'],
  caught: ['Told before the event ended', 'បានប្រាប់មុនព្រឹត្តិការណ៍បញ្ចប់', 'แจ้งก่อนเหตุการณ์สิ้นสุด'],
  late: ['Told after it ended', 'បានប្រាប់ក្រោយបញ្ចប់', 'แจ้งหลังเหตุการณ์สิ้นสุด'],
  missed: ['Missed', 'ខកខាន', 'พลาด'],
  false: ['False alerts', 'ការជូនដំណឹងមិនពិត', 'การแจ้งเท็จ'],
  lead: ['Lead time, median (negative = after the start)', 'ពេលជូនដំណឹងមុន មធ្យមភាគ (អវិជ្ជមាន = ក្រោយចាប់ផ្តើម)', 'เวลานำ มัธยฐาน (ค่าลบ = หลังเริ่ม)'],
  exc_true_min: ['Excursion minutes in the truth', 'នាទីលើសកម្រិតក្នុងការពិត', 'นาทีที่เกินช่วงในความจริง'],
  exc_seen_min: ['Excursion minutes in the record', 'នាទីលើសកម្រិតក្នុងកំណត់ត្រា', 'นาทีที่เกินช่วงในบันทึก'],
  exc_in_record: ['Excursions with a reading above the band', 'ការលើសកម្រិតដែលមានការអានលើចន្លោះ', 'เหตุเกินช่วงที่มีค่าอ่านสูงกว่าช่วง'],
  exc_not_in_record: ['Excursions with no reading above the band', 'ការលើសកម្រិតដែលគ្មានការអានលើចន្លោះ', 'เหตุเกินช่วงที่ไม่มีค่าอ่านสูงกว่าช่วง'],
  exc_longest_missed: ['Longest excursion absent from the record', 'ការលើសកម្រិតវែងបំផុតដែលអវត្តមានក្នុងកំណត់ត្រា', 'เหตุเกินช่วงที่นานที่สุดซึ่งไม่อยู่ในบันทึก'],
  cut_min: ['Power cut minutes', 'នាទីដាច់ភ្លើង', 'นาทีไฟดับ'],
  avail_true: ['Availability, truth', 'ភាពមាន ការពិត', 'ความพร้อมใช้งาน ความจริง'],
  avail_est: ['Availability, record', 'ភាពមាន កំណត់ត្រា', 'ความพร้อมใช้งาน บันทึก'],
  avail_err: ['Difference, percentage points', 'ភាពខុសគ្នា ពិន្ទុភាគរយ', 'ผลต่าง จุดเปอร์เซ็นต์'],
  'tests.n': ['Verified tests taken', 'តេស្តផ្ទៀងផ្ទាត់ដែលបានធ្វើ', 'การทดสอบยืนยันที่ทำ'],
  'tests.positive': ['Positive verified tests', 'តេស្តផ្ទៀងផ្ទាត់វិជ្ជមាន', 'ผลทดสอบยืนยันที่พบ'],
  'tests.covered': ['Episodes with a verified test inside', 'អំឡុងដែលមានតេស្តផ្ទៀងផ្ទាត់នៅក្នុង', 'ช่วงเหตุการณ์ที่มีการทดสอบยืนยันอยู่ภายใน'],
  short_min: ['Shortage minutes in the truth (tank below 10%)', 'នាទីខ្វះខាតក្នុងការពិត (ធុងក្រោម 10%)', 'นาทีที่ขาดน้ำในความจริง (ถังต่ำกว่า 10%)'],
  unseen_min: ['Shortage minutes before the receiver knew', 'នាទីខ្វះខាតមុនអ្នកទទួលដឹង', 'นาทีที่ขาดน้ำก่อนผู้รับรู้'],
};
for (const [k, v] of Object.entries(M)) a('m_' + k, ...v);
