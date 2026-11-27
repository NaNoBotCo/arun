// Words on screen in English, Khmer and Thai. {name} fills from the call.
const S = {
  place: { en: 'Phnom Penh', km: 'ភ្នំពេញ', th: 'พนมเปญ' },
  tagline: { en: 'Information outruns water.', km: 'ព័ត៌មានរត់លឿនជាងទឹក។', th: 'ข้อมูลไปถึงก่อนน้ำ' },
  scenarioTag: { en: 'Illustrative storm · proposed sensors', km: 'ព្យុះសាកល្បង · ឧបករណ៍ចាប់ដែលបានស្នើ', th: 'พายุจำลอง · เซนเซอร์ที่เสนอ' },
  network: { en: 'Network', km: 'បណ្ដាញ', th: 'เครือข่าย' },
  play: { en: 'Play', km: 'ចាក់', th: 'เล่น' }, pause: { en: 'Pause', km: 'ផ្អាក', th: 'หยุด' },
  back: { en: 'Back', km: 'ថយក្រោយ', th: 'กลับ' }, close: { en: 'Close', km: 'បិទ', th: 'ปิด' },
  d1: { en: 'See', km: 'មើល', th: 'ดู' }, d2: { en: 'How', km: 'របៀប', th: 'อย่างไร' }, d3: { en: 'Try', km: 'សាក', th: 'ลอง' },
  min: { en: 'min', km: 'នាទី', th: 'นาที' },
  mmh: { en: 'mm/h', km: 'មម/ម៉', th: 'มม./ชม.' },

  // captions during the opening
  cap1: { en: 'Phnom Penh, 27 November, {time}.', km: 'ភ្នំពេញ ថ្ងៃទី២៧ វិច្ឆិកា ម៉ោង {time}។', th: 'พนมเปญ 27 พฤศจิกายน เวลา {time}' },
  cap2: { en: 'A storm builds west of the city.', km: 'ព្យុះកំពុងកកើតនៅខាងលិចទីក្រុង។', th: 'พายุก่อตัวทางตะวันตกของเมือง' },
  cap3: { en: 'Rain gauges out in the fields feel it first.', km: 'ឧបករណ៍វាស់ទឹកភ្លៀងនៅតាមវាលស្រែ ដឹងមុនគេ។', th: 'เครื่องวัดฝนกลางทุ่งรู้ก่อนใคร' },
  cap4: { en: 'In the city, street cameras join: faces covered on the camera, three numbers sent.', km: 'នៅក្នុងទីក្រុង កាមេរ៉ាតាមផ្លូវចូលរួម៖ បិទមុខនៅលើកាមេរ៉ា ផ្ញើលេខបី។', th: 'ในเมือง กล้องริมถนนเข้าร่วม: ปิดใบหน้าที่กล้อง ส่งตัวเลขสามตัว' },
  cap5: { en: 'The numbers meet. A forecast forms.', km: 'លេខទាំងអស់ជួបគ្នា។ ការព្យាករណ៍កើតឡើង។', th: 'ตัวเลขมาบรรจบกัน เกิดเป็นการพยากรณ์' },
  cap6: { en: 'The {kind} hears {n} minutes before water reaches its door.', km: '{kind} ដឹង {n} នាទី មុនពេលទឹកដល់មាត់ទ្វារ។', th: '{kind}รู้ล่วงหน้า {n} นาที ก่อนน้ำถึงประตู' },
  capNone: { en: 'In this storm, water stays below the door. Try another storm.', km: 'ព្យុះនេះមិនធ្វើឲ្យទឹកដល់មាត់ទ្វារទេ។ សាកព្យុះផ្សេង។', th: 'พายุลูกนี้น้ำไม่ถึงประตู ลองพายุลูกอื่น' },

  // facility
  kind_hotel: { en: 'hotel', km: 'សណ្ឋាគារ', th: 'โรงแรม' },
  kind_hospital: { en: 'hospital', km: 'មន្ទីរពេទ្យ', th: 'โรงพยาบาล' },
  kind_datahall: { en: 'data hall', km: 'អគារទិន្នន័យ', th: 'อาคารข้อมูล' },
  facTitle: { en: 'A {kind} (illustrative)', km: '{kind} (ឧទាហរណ៍)', th: '{kind} (ตัวอย่าง)' },
  toPrepare: { en: 'to prepare', km: 'សម្រាប់ត្រៀម', th: 'ให้เตรียมตัว' },
  alone: { en: 'On its own', km: 'ដោយខ្លួនឯង', th: 'ลำพัง' },
  networkOff: { en: 'Network off: the {kind} has only its own roof gauge.', km: 'បិទបណ្ដាញ៖ {kind} មានតែឧបករណ៍វាស់លើដំបូលខ្លួនឯង។', th: 'ปิดเครือข่าย: {kind}มีแค่เครื่องวัดบนหลังคาของตัวเอง' },
  howBtn: { en: 'How it happens', km: 'របៀបដែលវាកើតឡើង', th: 'เกิดขึ้นอย่างไร' },
  warnAt: { en: 'Notice', km: 'ការជូនដំណឹង', th: 'การแจ้ง' },
  waterAt: { en: 'Water at the door', km: 'ទឹកដល់មាត់ទ្វារ', th: 'น้ำถึงประตู' },
  heavyAt: { en: 'Heavy rain here', km: 'ភ្លៀងខ្លាំងនៅទីនេះ', th: 'ฝนหนักที่นี่' },
  noWater: { en: 'Water stays below the door in this storm.', km: 'ក្នុងព្យុះនេះ ទឹកមិនដល់មាត់ទ្វារទេ។', th: 'พายุลูกนี้น้ำไม่ถึงประตู' },
  facD1: { en: 'Same storm, same street. With the network, notice comes {gain} minutes earlier.', km: 'ព្យុះដដែល ផ្លូវដដែល។ មានបណ្ដាញ ការជូនដំណឹងមកមុន {gain} នាទី។', th: 'พายุเดิม ถนนเดิม มีเครือข่ายแล้วได้รับแจ้งเร็วขึ้น {gain} นาที' },
  facD2a: { en: 'Chance of heavy rain here within 90 minutes, as the reports arrive. Notice goes out at 50%.', km: 'ឱកាសភ្លៀងខ្លាំងនៅទីនេះក្នុង ៩០ នាទី តាមរបាយការណ៍ដែលមកដល់។ ការជូនដំណឹងចេញនៅ ៥០%។', th: 'โอกาสฝนหนักที่นี่ภายใน 90 นาที ตามรายงานที่เข้ามา ส่งการแจ้งเมื่อถึง 50%' },
  facD2b: { en: 'Water in the street: rain on {catch} ha runs off; drains take up to {drain} mm/h; the rest stands in the low street until it reaches {kerb} cm.', km: 'ទឹកក្នុងផ្លូវ៖ ភ្លៀងលើផ្ទៃ {catch} ហិកតា ហូរចុះ។ លូទទួលបានដល់ {drain} មម/ម៉។ នៅសល់ដក់ក្នុងផ្លូវទាប រហូតដល់ {kerb} សង់ទីម៉ែត្រ។', th: 'น้ำบนถนน: ฝนบนพื้นที่ {catch} เฮกตาร์ไหลลง ท่อรับได้ถึง {drain} มม./ชม. ที่เหลือขังในถนนต่ำจนถึง {kerb} ซม.' },
  motionFit: { en: 'Storm motion from the times rain began at {n} sensors: {speed} km/h toward {dir}.', km: 'ចលនាព្យុះ គណនាពីពេលភ្លៀងចាប់ផ្ដើមនៅឧបករណ៍ {n}៖ {speed} គម/ម៉ ទៅទិស{dir}។', th: 'การเคลื่อนที่ของพายุ จากเวลาที่ฝนเริ่มที่เซนเซอร์ {n} ตัว: {speed} กม./ชม. ไปทาง{dir}' },
  truthWas: { en: 'The illustrative storm moves at {speed} km/h toward {dir}.', km: 'ព្យុះសាកល្បងផ្លាស់ទី {speed} គម/ម៉ ទៅទិស{dir}។', th: 'พายุจำลองเคลื่อนที่ {speed} กม./ชม. ไปทาง{dir}' },
  assume: { en: 'Assumed numbers: change them.', km: 'លេខសន្មត៖ អាចប្ដូរបាន។', th: 'ตัวเลขสมมติ: เปลี่ยนได้' },
  kindQ: { en: 'What is it?', km: 'វាជាអ្វី?', th: 'เป็นอะไร' },
  fits: { en: 'done', km: 'ទាន់', th: 'ทัน' }, nofit: { en: 'late', km: 'មិនទាន់', th: 'ไม่ทัน' },
  pumps: { en: 'Pumps', km: 'ម៉ាស៊ីនបូម', th: 'ปั๊มน้ำ' },
  drains: { en: 'Drains take up to', km: 'លូទទួលបានដល់', th: 'ท่อรับได้ถึง' },
  moveFac: { en: 'Move it: tap the map', km: 'ផ្លាស់ទី៖ ប៉ះលើផែនទី', th: 'ย้าย: แตะบนแผนที่' },
  moveHint: { en: 'Tap any street to place the {kind} there.', km: 'ប៉ះផ្លូវណាមួយ ដើម្បីដាក់{kind}នៅទីនោះ។', th: 'แตะถนนใดก็ได้เพื่อวาง{kind}ที่นั่น' },
  storms24: { en: '24 storms, this place, this network', km: 'ព្យុះ ២៤ ទីកន្លែងនេះ បណ្ដាញនេះ', th: 'พายุ 24 ลูก ที่นี่ เครือข่ายนี้' },
  median: { en: 'Middle storm: {n} min more', km: 'ព្យុះកណ្ដាល៖ បន្ថែម {n} នាទី', th: 'พายุกลาง: เพิ่ม {n} นาที' },
  anotherStorm: { en: 'Another storm', km: 'ព្យុះផ្សេងទៀត', th: 'พายุลูกอื่น' },
  firstStreet: { en: 'Which street would you watch first?', km: 'តើលោកអ្នកនឹងមើលផ្លូវណាមុនគេ?', th: 'คุณจะเฝ้าดูถนนไหนก่อน' },
  ring: { en: 'Network reach', km: 'ចម្ងាយបណ្ដាញ', th: 'ระยะเครือข่าย' },
  ringCity: { en: 'City', km: 'ទីក្រុង', th: 'ในเมือง' }, ringSub: { en: '+ 9 km', km: '+ ៩ គម', th: '+ 9 กม.' }, ringRegion: { en: '+ 18 km', km: '+ ១៨ គម', th: '+ 18 กม.' },
  ringNote: { en: 'Lead time grows with how far upstream the sensors reach.', km: 'ពេលវេលាជូនដំណឹងកើនឡើង តាមចម្ងាយដែលឧបករណ៍ចាប់ទៅដល់ខាងលើ។', th: 'เวลาล่วงหน้าเพิ่มตามระยะที่เซนเซอร์ไปถึงต้นทาง' },

  // actions
  a_cars: { en: 'Move guest cars up', km: 'រើឡានភ្ញៀវឡើងលើ', th: 'ย้ายรถแขกขึ้นที่สูง' },
  a_sandbags: { en: 'Sandbags at the doors', km: 'បាវខ្សាច់នៅមាត់ទ្វារ', th: 'กระสอบทรายที่ประตู' },
  a_lobby: { en: 'Lift lobby equipment', km: 'លើកឧបករណ៍ក្នុងសាល', th: 'ยกอุปกรณ์ล็อบบี้' },
  a_pumps: { en: 'Start the pumps', km: 'បើកម៉ាស៊ីនបូម', th: 'เปิดปั๊ม' },
  a_guests: { en: 'Tell the guests', km: 'ប្រាប់ភ្ញៀវ', th: 'แจ้งแขก' },
  a_ward: { en: 'Move ground-floor patients', km: 'រើអ្នកជំងឺជាន់ផ្ទាល់ដី', th: 'ย้ายผู้ป่วยชั้นล่าง' },
  a_genset: { en: 'Test the generator', km: 'សាកម៉ាស៊ីនភ្លើង', th: 'ทดสอบเครื่องปั่นไฟ' },
  a_basement: { en: 'Seal the basement', km: 'បិទបន្ទប់ក្រោមដី', th: 'ปิดห้องใต้ดิน' },
  a_ambulance: { en: 'Switch ambulance route', km: 'ប្ដូរផ្លូវឡានពេទ្យ', th: 'เปลี่ยนเส้นทางรถพยาบาล' },
  a_staff: { en: 'Call in staff', km: 'ហៅបុគ្គលិក', th: 'เรียกเจ้าหน้าที่' },
  a_transfer: { en: 'Start generators, transfer load', km: 'បើកម៉ាស៊ីនភ្លើង ផ្ទេរបន្ទុក', th: 'เดินเครื่องปั่นไฟ ถ่ายโหลด' },
  a_fuel: { en: 'Top up fuel', km: 'បំពេញប្រេង', th: 'เติมน้ำมัน' },
  a_vaults: { en: 'Seal cable vaults', km: 'បិទរណ្ដៅខ្សែ', th: 'ปิดบ่อสายเคเบิล' },
  a_loadshift: { en: 'Shift work to a second site', km: 'ផ្ទេរការងារទៅទីតាំងទីពីរ', th: 'ย้ายงานไปไซต์ที่สอง' },
  a_crew: { en: 'Crew on site', km: 'ក្រុមការងារនៅនឹងកន្លែង', th: 'ทีมงานประจำที่' },

  // camera / Face Shield
  camTitle: { en: 'Street camera {id} (proposed)', km: 'កាមេរ៉ាផ្លូវ {id} (បានស្នើ)', th: 'กล้องริมถนน {id} (ที่เสนอ)' },
  camD1: { en: 'A drawn street, raining at {rate} mm/h at {time}. Watch it become numbers.', km: 'ផ្លូវគូរដោយកូដ ភ្លៀង {rate} មម/ម៉ ម៉ោង {time}។ មើលវាក្លាយជាលេខ។', th: 'ถนนที่วาดด้วยโค้ด ฝนตก {rate} มม./ชม. เวลา {time} ดูมันกลายเป็นตัวเลข' },
  drawn: { en: 'Synthetic scene, drawn by code. No real people.', km: 'ទិដ្ឋភាពសំយោគ គូរដោយកូដ។ គ្មានមនុស្សពិត។', th: 'ภาพสังเคราะห์ วาดด้วยโค้ด ไม่มีคนจริง' },
  replay: { en: 'Again', km: 'ម្ដងទៀត', th: 'อีกครั้ง' },
  mRain: { en: 'rain', km: 'ភ្លៀង', th: 'ฝน' }, mWater: { en: 'water on road', km: 'ទឹកលើផ្លូវ', th: 'น้ำบนถนน' }, mVis: { en: 'visibility', km: 'ចម្ងាយមើលឃើញ', th: 'ทัศนวิสัย' },
  sentVs: { en: 'Sent: {sent} bytes. Picture: {pic} kB, stays on the camera.', km: 'ផ្ញើ៖ {sent} បៃ។ រូបភាព៖ {pic} kB នៅលើកាមេរ៉ា។', th: 'ส่ง: {sent} ไบต์ ภาพ: {pic} kB อยู่ที่กล้อง' },
  measuredFrom: { en: 'Measured from the pixels on this phone. The storm says {truth} mm/h here.', km: 'វាស់ពីភីកសែលលើទូរស័ព្ទនេះ។ ព្យុះនិយាយថា {truth} មម/ម៉ នៅទីនេះ។', th: 'วัดจากพิกเซลบนโทรศัพท์เครื่องนี้ พายุบอกว่าที่นี่ {truth} มม./ชม.' },
  camD2: { en: 'What stays, what goes', km: 'អ្វីរក្សា អ្វីបោះចោល', th: 'เก็บอะไร ทิ้งอะไร' },
  keepRows: { en: 'Faces|covered, then not sent;Number plates|covered, then not sent;The picture|stays on the camera;Rain, water, visibility|sent as three numbers', km: 'មុខ|បិទ ហើយមិនផ្ញើ;ស្លាកលេខ|បិទ ហើយមិនផ្ញើ;រូបភាព|នៅលើកាមេរ៉ា;ភ្លៀង ទឹក ចម្ងាយមើលឃើញ|ផ្ញើជាលេខបី', th: 'ใบหน้า|ปิด แล้วไม่ส่ง;ป้ายทะเบียน|ปิด แล้วไม่ส่ง;ภาพ|อยู่ที่กล้อง;ฝน น้ำ ทัศนวิสัย|ส่งเป็นตัวเลขสามตัว' },
  recall: { en: 'faces found', km: 'រកឃើញមុខ', th: 'พบใบหน้า' }, covered: { en: 'fully covered', km: 'បិទពេញ', th: 'ปิดครบ' },
  released: { en: 'photos out with a face showing', km: 'រូបចេញដែលនៅឃើញមុខ', th: 'ภาพที่หลุดออกโดยเห็นหน้า' },
  missBy: { en: 'Missed, by kind of face', km: 'ខកខាន តាមប្រភេទមុខ', th: 'พลาด แยกตามแบบใบหน้า' },
  c_clear: { en: 'clear', km: 'ច្បាស់', th: 'ชัด' }, c_hidden: { en: 'partly hidden', km: 'បាំងខ្លះ', th: 'ถูกบังบางส่วน' }, c_edge: { en: 'cut by the edge', km: 'កាត់ដោយគែម', th: 'ถูกขอบตัด' }, c_screen: { en: 'drawings, screens', km: 'គំនូរ អេក្រង់', th: 'ภาพวาด จอ' }, c_small: { en: 'small', km: 'តូច', th: 'เล็ก' },
  numbersOnly: { en: 'When only numbers leave the camera, a missed face stays on the camera too.', km: 'ពេលមានតែលេខចេញពីកាមេរ៉ា មុខដែលខកខានក៏នៅលើកាមេរ៉ាដែរ។', th: 'เมื่อมีแค่ตัวเลขออกจากกล้อง ใบหน้าที่พลาดก็อยู่ที่กล้องเช่นกัน' },
  setting: { en: 'Detector setting', km: 'ការកំណត់ឧបករណ៍រក', th: 'ค่าตัวตรวจจับ' },
  night: { en: 'Night', km: 'យប់', th: 'กลางคืน' },
  camOff: { en: 'Turn this camera off', km: 'បិទកាមេរ៉ានេះ', th: 'ปิดกล้องนี้' }, camOn: { en: 'Turn it back on', km: 'បើកវិញ', th: 'เปิดกลับ' },
  effect: { en: 'Time to prepare: {a} → {b} min', km: 'ពេលត្រៀម៖ {a} → {b} នាទី', th: 'เวลาเตรียมตัว: {a} → {b} นาที' },

  // gauge
  gaugeTitle: { en: 'Rain gauge {id} (proposed)', km: 'ឧបករណ៍វាស់ទឹកភ្លៀង {id} (បានស្នើ)', th: 'เครื่องวัดฝน {id} (ที่เสนอ)' },
  gaugeD1: { en: 'Reads {rate} mm/h at {time}. Rain began here at {onset}.', km: 'អាន {rate} មម/ម៉ ម៉ោង {time}។ ភ្លៀងចាប់ផ្ដើមនៅទីនេះម៉ោង {onset}។', th: 'อ่านได้ {rate} มม./ชม. เวลา {time} ฝนเริ่มที่นี่เวลา {onset}' },
  gaugeDry: { en: 'Reads {rate} mm/h at {time}. Steady rain (8 mm/h) has not reached it yet.', km: 'អាន {rate} មម/ម៉ ម៉ោង {time}។ ភ្លៀងជាប់ (៨ មម/ម៉) មិនទាន់មកដល់ទេ។', th: 'อ่านได้ {rate} มม./ชม. เวลา {time} ฝนต่อเนื่อง (8 มม./ชม.) ยังมาไม่ถึง' },
  motionPeak: { en: 'Storm motion from the times the heaviest rain passed {n} sensors: {speed} km/h toward {dir}.', km: 'ចលនាព្យុះ គណនាពីពេលភ្លៀងខ្លាំងបំផុតឆ្លងកាត់ឧបករណ៍ {n}៖ {speed} គម/ម៉ ទៅទិស{dir}។', th: 'การเคลื่อนที่ของพายุ จากเวลาที่ฝนหนักที่สุดผ่านเซนเซอร์ {n} ตัว: {speed} กม./ชม. ไปทาง{dir}' },
  fastWhy: { en: 'The storm is still forming as it travels, so rain starts sooner downstream than its speed alone explains, and the first fit reads it as faster. Once the heaviest rain has passed three sensors, the fit uses those times.', km: 'ព្យុះកំពុងកកើតពេលវាធ្វើដំណើរ ដូច្នេះភ្លៀងចាប់ផ្ដើមមុននៅខាងក្រោម ហើយការគណនាដំបូងឃើញវាលឿនជាង។ ពេលភ្លៀងខ្លាំងបំផុតឆ្លងកាត់ឧបករណ៍បី ការគណនាប្រើពេលទាំងនោះ។', th: 'พายุยังก่อตัวขณะเคลื่อนที่ ฝนจึงเริ่มเร็วกว่าที่ความเร็วอธิบายได้ การคำนวณแรกจึงเห็นว่าเร็วกว่า เมื่อฝนหนักที่สุดผ่านเซนเซอร์สามตัวแล้ว การคำนวณใช้เวลาเหล่านั้นแทน' },
  inTime: { en: 'Done before water reaches the door', km: 'ធ្វើរួចមុនទឹកដល់មាត់ទ្វារ', th: 'ทำเสร็จก่อนน้ำถึงประตู' },
  goRain: { en: 'Rain peaks here at {time}: go there', km: 'ភ្លៀងខ្លាំងបំផុតនៅទីនេះម៉ោង {time}៖ ទៅ', th: 'ฝนหนักสุดที่นี่เวลา {time}: ไปที่นั่น' },
  gaugeD2: { en: 'A tipping bucket: each 0.2 mm of rain tips it once. It reports the last 5 minutes, one minute late. Each report is a timestamp and a number.', km: 'ធុងផ្ដួល៖ ភ្លៀងរៀងរាល់ ០,២ មម ផ្ដួលវាម្ដង។ វារាយការណ៍ ៥ នាទីចុងក្រោយ យឺតមួយនាទី។ របាយការណ៍នីមួយៗជាម៉ោង និងលេខមួយ។', th: 'ถังกระดก: ฝนทุก 0.2 มม. ทำให้กระดกหนึ่งครั้ง รายงาน 5 นาทีล่าสุด ช้าหนึ่งนาที แต่ละรายงานคือเวลาและตัวเลขหนึ่งตัว' },
  gaugeOff: { en: 'Turn this gauge off', km: 'បិទឧបករណ៍នេះ', th: 'ปิดเครื่องวัดนี้' },
  addGauge: { en: 'Add a gauge: tap the map', km: 'បន្ថែមឧបករណ៍៖ ប៉ះលើផែនទី', th: 'เพิ่มเครื่องวัด: แตะบนแผนที่' },
  addHint: { en: 'Tap anywhere to add a proposed gauge there.', km: 'ប៉ះកន្លែងណាមួយ ដើម្បីបន្ថែមឧបករណ៍នៅទីនោះ។', th: 'แตะที่ใดก็ได้เพื่อเพิ่มเครื่องวัดที่นั่น' },
  reports: { en: 'Reports (gold) and the storm (faint)', km: 'របាយការណ៍ (មាស) និងព្យុះ (ស្រាល)', th: 'รายงาน (ทอง) และพายุ (จาง)' },

  // place / rain
  placeTitle: { en: 'This spot', km: 'ចំណុចនេះ', th: 'จุดนี้' },
  placeNow: { en: 'Rain now', km: 'ភ្លៀងឥឡូវ', th: 'ฝนตอนนี้' },
  placeArr: { en: 'Heavy rain arrives', km: 'ភ្លៀងខ្លាំងមកដល់', th: 'ฝนหนักมาถึง' },
  placeHAR: { en: 'Above the river', km: 'ខ្ពស់ជាងទន្លេ', th: 'สูงกว่าแม่น้ำ' },
  placeNo: { en: 'not in the next 2 h', km: 'មិនមែនក្នុង ២ ម៉ោងខាងមុខ', th: 'ไม่ใน 2 ชม. ข้างหน้า' },
  forecastBand: { en: 'Forecast from {time}: middle line and the spread of 48 runs', km: 'ការព្យាករណ៍ពីម៉ោង {time}៖ ខ្សែកណ្ដាល និងការរីករាលនៃការរត់ ៤៨', th: 'พยากรณ์จาก {time}: เส้นกลางและการกระจายของ 48 รอบ' },
  waiting: { en: 'Waiting for rain at three sensors to fix the storm’s motion.', km: 'កំពុងរង់ចាំភ្លៀងនៅឧបករណ៍បី ដើម្បីកំណត់ចលនាព្យុះ។', th: 'รอฝนที่เซนเซอร์สามตัวเพื่อหาการเคลื่อนที่ของพายุ' },
  placeD2: { en: 'Each sensor’s record is carried forward along the storm’s motion. Where records pass near this spot, they say what is coming. 48 runs vary the motion by its uncertainty.', km: 'កំណត់ត្រារបស់ឧបករណ៍នីមួយៗត្រូវបានរុញទៅមុខតាមចលនាព្យុះ។ កន្លែងដែលកំណត់ត្រាឆ្លងកាត់ជិតចំណុចនេះ វាប្រាប់អ្វីដែលនឹងមក។ ការរត់ ៤៨ ប្ដូរចលនាតាមភាពមិនច្បាស់លាស់។', th: 'บันทึกของเซนเซอร์แต่ละตัวถูกเลื่อนไปตามการเคลื่อนที่ของพายุ ที่ใดบันทึกผ่านใกล้จุดนี้ ก็บอกได้ว่าอะไรกำลังมา 48 รอบปรับการเคลื่อนที่ตามความไม่แน่นอน' },
  skill: { en: 'Forecast +30 min, scored on a separate grid of the storm', km: 'ព្យាករណ៍ +៣០ នាទី វាយតម្លៃលើក្រឡាចត្រង្គដាច់ដោយឡែក', th: 'พยากรณ์ +30 นาที ให้คะแนนบนตารางแยกของพายุ' },
  csi: { en: 'heavy-rain hits (CSI)', km: 'ត្រូវភ្លៀងខ្លាំង (CSI)', th: 'ตรงฝนหนัก (CSI)' },
  rmse: { en: 'typical error', km: 'កំហុសធម្មតា', th: 'ความคลาดเคลื่อนทั่วไป' },
  persist: { en: 'no-motion guess', km: 'ការទាយគ្មានចលនា', th: 'เดาแบบไม่เคลื่อนที่' },
  addHere: { en: 'Add a gauge here', km: 'បន្ថែមឧបករណ៍នៅទីនេះ', th: 'เพิ่มเครื่องวัดที่นี่' },

  // river / Sky Reach
  riverTitle: { en: 'Sky Reach: the river', km: 'Sky Reach៖ ទន្លេ', th: 'Sky Reach: แม่น้ำ' },
  riverD1: { en: 'Raise the river and the model shows the ground it could reach. Surface heights from satellites; dikes and drains are not in it.', km: 'លើកទឹកទន្លេឡើង គំរូបង្ហាញដីដែលទឹកអាចទៅដល់។ កម្ពស់ផ្ទៃពីផ្កាយរណប គ្មានទំនប់ និងលូ។', th: 'ยกระดับแม่น้ำ แบบจำลองแสดงพื้นดินที่น้ำไปถึงได้ ความสูงพื้นผิวจากดาวเทียม ไม่รวมคันกั้นน้ำและท่อระบาย' },
  rise: { en: 'River above its low-water surface', km: 'ទន្លេខ្ពស់ជាងផ្ទៃទឹកទាប', th: 'แม่น้ำสูงกว่าระดับน้ำต่ำ' },
  floodedKm: { en: 'land reached', km: 'ដីដែលទឹកដល់', th: 'พื้นที่ที่น้ำถึง' },
  streetsKm: { en: 'mapped streets', km: 'ផ្លូវដែលមានក្នុងផែនទី', th: 'ถนนในแผนที่' },
  scoreL: { en: 'match with 38 years of satellite water', km: 'ការផ្គូផ្គងជាមួយទឹកពីផ្កាយរណប ៣៨ ឆ្នាំ', th: 'ความตรงกับน้ำจากดาวเทียม 38 ปี' },
  baseL: { en: '“flood everything” scores', km: '“លិចទាំងអស់” បានពិន្ទុ', th: '“ท่วมทั้งหมด” ได้คะแนน' },
  riverD2: { en: 'Sky Reach: height above the nearest river cell; raise the river, flood what is lower and connected, and score against where satellites saw water (1984–2021).', km: 'Sky Reach៖ កម្ពស់ពីលើក្រឡាទន្លេជិតបំផុត; បង្កើនកម្ពស់ទឹកទន្លេ ជន់លិចកន្លែងដែលទាបជាង និងភ្ជាប់គ្នា ហើយដាក់ពិន្ទុធៀបនឹងកន្លែងដែលផ្កាយរណបបានឃើញទឹក (1984–2021)។', th: 'Sky Reach: ความสูงเหนือช่องแม่น้ำที่ใกล้ที่สุด ยกระดับแม่น้ำ ให้น้ำท่วมจุดที่ต่ำกว่าและเชื่อมกัน แล้วให้คะแนนเทียบกับจุดที่ดาวเทียมเห็นน้ำ (1984–2021)' },
  pp: { en: 'Phnom Penh, first run here: best {score} at +{rise} m against {base}, fitted.', km: 'ភ្នំពេញ ការរត់ដំបូងនៅទីនេះ៖ ល្អបំផុត {score} នៅ +{rise} ម ធៀប {base} ដោយការផ្គូផ្គង។', th: 'พนมเปญ รันครั้งแรกที่นี่: ดีที่สุด {score} ที่ +{rise} ม. เทียบ {base} แบบปรับให้เข้า' },
  ppWhy: { en: 'In this height map the river surface is a flat 1.0 m and the riverbanks stand above the land behind them, so the river has to rise about 10 m before land floods. Lakes and rain ponds are in the satellite record too. A measured river level from a gauge is the next input.', km: 'ក្នុងផែនទីកម្ពស់នេះ ផ្ទៃទន្លេរាបស្មើ ១,០ ម ហើយច្រាំងទន្លេខ្ពស់ជាងដីខាងក្រោយ ដូច្នេះទន្លេត្រូវឡើងប្រហែល ១០ ម ទើបដីលិច។ បឹង និងទឹកភ្លៀងដក់ ក៏មាននៅក្នុងកំណត់ត្រាផ្កាយរណបដែរ។ កម្ពស់ទន្លេដែលវាស់ពីឧបករណ៍ គឺជាទិន្នន័យបន្ទាប់។', th: 'ในแผนที่ความสูงนี้ ผิวแม่น้ำแบนที่ 1.0 ม. และตลิ่งสูงกว่าพื้นดินด้านหลัง แม่น้ำจึงต้องสูงขึ้นราว 10 ม. ก่อนน้ำท่วมพื้นดิน ทะเลสาบและน้ำฝนขังก็อยู่ในบันทึกดาวเทียมด้วย ระดับน้ำที่วัดจากเครื่องวัดคือข้อมูลถัดไป' },
  tonle: { en: 'November to May the Tonle Sap drains the great lake into the Mekong; June to October the Mekong’s rise pushes it back toward the lake.', km: 'ពីខែវិច្ឆិកាដល់ឧសភា ទន្លេសាបបង្ហូរទឹកពីបឹងទន្លេសាបទៅទន្លេមេគង្គ។ ពីខែមិថុនាដល់តុលា ទឹកមេគង្គឡើងរុញវាត្រឡប់ទៅបឹងវិញ។', th: 'พฤศจิกายนถึงพฤษภาคม โตนเลสาบระบายน้ำจากทะเลสาบลงแม่น้ำโขง มิถุนายนถึงตุลาคม แม่น้ำโขงที่สูงขึ้นดันกลับไปยังทะเลสาบ' },
  seenOnce: { en: 'seen once', km: 'ឃើញម្ដង', th: 'เห็นครั้งเดียว' }, seen10: { en: 'in 10% of views', km: 'ក្នុង ១០% នៃការមើល', th: 'ใน 10% ของภาพ' },
  bestFit: { en: 'Best fit', km: 'ត្រូវបំផុត', th: 'ตรงที่สุด' },

  // compute
  cmpTitle: { en: 'Compute (illustrative)', km: 'កុំព្យូទ័រ (ឧទាហរណ៍)', th: 'การประมวลผล (ตัวอย่าง)' },
  cmpD1: { en: 'While you watched, this phone ran {runs} forecasts: {cells} grid-cell steps.', km: 'ពេលលោកអ្នកមើល ទូរស័ព្ទនេះបានរត់ការព្យាករណ៍ {runs} ដង៖ {cells} ជំហានក្រឡា។', th: 'ระหว่างที่คุณดู โทรศัพท์เครื่องนี้รันพยากรณ์ {runs} ครั้ง: {cells} ขั้นของช่องตาราง' },
  cmpRate: { en: 'Measured on this phone just now: {rate} cell-steps per second.', km: 'វាស់លើទូរស័ព្ទនេះមុននេះបន្តិច៖ {rate} ជំហានក្រឡាក្នុងមួយវិនាទី។', th: 'วัดบนโทรศัพท์เครื่องนี้เมื่อครู่: {rate} ขั้นต่อวินาที' },
  edge: { en: 'On the camera', km: 'លើកាមេរ៉ា', th: 'ที่กล้อง' }, centre: { en: 'In the data center', km: 'ក្នុងមជ្ឈមណ្ឌលទិន្នន័យ', th: 'ในศูนย์ข้อมูล' },
  edgeL: { en: 'cover faces and plates · measure rain, water, visibility · send three numbers', km: 'បិទមុខ និងស្លាកលេខ · វាស់ភ្លៀង ទឹក ចម្ងាយមើលឃើញ · ផ្ញើលេខបី', th: 'ปิดใบหน้าและป้ายทะเบียน · วัดฝน น้ำ ทัศนวิสัย · ส่งตัวเลขสามตัว' },
  centreL: { en: 'storm motion · ensemble forecasts · scoring against what happened · retraining the detectors · river models on better height data', km: 'ចលនាព្យុះ · ការព្យាករណ៍ច្រើនដង · វាយតម្លៃធៀបនឹងអ្វីដែលកើតឡើង · បង្ហាត់ឧបករណ៍រកឡើងវិញ · គំរូទន្លេលើទិន្នន័យកម្ពស់ល្អជាង', th: 'การเคลื่อนที่ของพายุ · พยากรณ์หลายรอบ · ให้คะแนนเทียบกับสิ่งที่เกิดขึ้น · ฝึกตัวตรวจจับใหม่ · แบบจำลองแม่น้ำบนข้อมูลความสูงที่ดีขึ้น' },
  cmpD3: { en: 'Size it', km: 'គណនាទំហំ', th: 'คำนวณขนาด' },
  area: { en: 'Area', km: 'ផ្ទៃ', th: 'พื้นที่' }, cell: { en: 'Grid cell', km: 'ក្រឡា', th: 'ช่องตาราง' }, runs: { en: 'Runs per forecast', km: 'ការរត់ក្នុងការព្យាករណ៍មួយ', th: 'รอบต่อการพยากรณ์' }, every: { en: 'New forecast every', km: 'ព្យាករណ៍ថ្មីរៀងរាល់', th: 'พยากรณ์ใหม่ทุก' },
  perDay: { en: 'cell-steps a day', km: 'ជំហានក្រឡាក្នុងមួយថ្ងៃ', th: 'ขั้นต่อวัน' },
  phoneDays: { en: 'this phone, days per day', km: 'ទូរស័ព្ទនេះ ថ្ងៃក្នុងមួយថ្ងៃ', th: 'โทรศัพท์นี้ วันต่อวัน' },
  laptopCores: { en: 'laptop cores, all day (measured M2)', km: 'ស្នូលកុំព្យូទ័រយួរដៃ ពេញមួយថ្ងៃ (វាស់ M2)', th: 'คอร์แล็ปท็อป ทั้งวัน (วัด M2)' },
  cams: { en: 'Cameras', km: 'កាមេរ៉ា', th: 'กล้อง' }, fpm: { en: 'Frames a minute each', km: 'រូបភាពក្នុងមួយនាទីនីមួយៗ', th: 'เฟรมต่อนาทีต่อกล้อง' },
  cmpNote: { en: 'This forecast kernel is simple. A physics weather model costs far more per cell; the arithmetic is the same.', km: 'ខឺណែលព្យាករណ៍នេះសាមញ្ញ។ គំរូអាកាសធាតុរូបវិទ្យាចំណាយច្រើនជាងនេះក្នុងមួយក្រឡា ការគណនាដូចគ្នា។', th: 'เคอร์เนลพยากรณ์นี้เรียบง่าย แบบจำลองอากาศเชิงฟิสิกส์ใช้มากกว่านี้มากต่อช่อง แต่เลขคณิตเหมือนกัน' },
  research: { en: 'Other instruments', km: 'ឧបករណ៍ផ្សេងទៀត', th: 'เครื่องมืออื่น' },
  rArun: { en: 'ARUN: 21 exhibits on possible worlds, nanobotco.github.io/arun', km: 'ARUN៖ ការតាំងបង្ហាញ ២១ អំពីពិភពដែលអាចកើតមាន nanobotco.github.io/arun', th: 'ARUN: 21 นิทรรศการเรื่องโลกที่เป็นไปได้ nanobotco.github.io/arun' },

  // landmark
  lmRain: { en: 'Rain here at {time}', km: 'ភ្លៀងនៅទីនេះម៉ោង {time}', th: 'ฝนที่นี่เวลา {time}' },
  route: { en: 'From the {kind} to here', km: 'ពី{kind}មកទីនេះ', th: 'จาก{kind}มาที่นี่' },
  dry: { en: 'dry streets', km: 'ផ្លូវស្ងួត', th: 'ถนนแห้ง' }, wetNow: { en: 'in this rain', km: 'ក្នុងភ្លៀងនេះ', th: 'ในฝนนี้' },
  routeNote: { en: 'Mapped streets, joined where they cross. No one-way rules: not directions.', km: 'ផ្លូវក្នុងផែនទី ភ្ជាប់គ្នានៅចំណុចប្រសព្វ។ គ្មានច្បាប់ផ្លូវមួយទិស៖ មិនមែនការណែនាំផ្លូវ។', th: 'ถนนในแผนที่ เชื่อมกันที่จุดตัด ไม่มีกฎเดินรถทางเดียว: ไม่ใช่การนำทาง' },
  photoBy: { en: 'Photo', km: 'រូបថត', th: 'ภาพ' },

  // directions
  dirs: { en: 'east|north-east|north|north-west|west|south-west|south|south-east', km: 'កើត|ឦសាន|ជើង|ពាយ័ព្យ|លិច|និរតី|ត្បូង|អាគ្នេយ៍', th: 'ตะวันออก|ตะวันออกเฉียงเหนือ|เหนือ|ตะวันตกเฉียงเหนือ|ตะวันตก|ตะวันตกเฉียงใต้|ใต้|ตะวันออกเฉียงใต้' },
  sources: { en: 'Map © OpenStreetMap contributors (ODbL) · buildings: Overture Maps (Google, Microsoft, OSM), heights estimated where not mapped · heights: Copernicus DEM GLO-30 © DLR, Airbus · satellite water: EC JRC/Google · photos: Wikimedia Commons, named on each', km: 'ផែនទី © OpenStreetMap (ODbL) · អគារ៖ Overture Maps · កម្ពស់៖ Copernicus DEM GLO-30 · ទឹកពីផ្កាយរណប៖ EC JRC/Google · រូបថត៖ Wikimedia Commons', th: 'แผนที่ © OpenStreetMap (ODbL) · อาคาร: Overture Maps · ความสูง: Copernicus DEM GLO-30 · น้ำจากดาวเทียม: EC JRC/Google · ภาพ: Wikimedia Commons' },
};

// Modules add their own words: addWords({ key: { en, km, th } }). A key added twice is an error.
export function addWords(dict) {
  for (const [k, v] of Object.entries(dict)) { if (S[k]) throw new Error('word added twice: ' + k); S[k] = v; }
}
export const allWords = () => S;

let LANG = 'en';
export const setLang = l => { LANG = l; };
export const getLang = () => LANG;
export function t(key, vars) {
  const e = S[key]; let s = e ? (e[LANG] ?? e.en) : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}
const KM_DIG = '០១២៣៤៥៦៧៨៩';
// numbers stay Western digits in every language: easier to read side by side
export const num = (v, d = 0) => (v == null || Number.isNaN(v) ? '–' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const hhmm = tMin => { const m = Math.round(tMin) + 15 * 60; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
export function dirName(deg) { const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8; return t('dirs').split('|')[i]; }
export { KM_DIG };
