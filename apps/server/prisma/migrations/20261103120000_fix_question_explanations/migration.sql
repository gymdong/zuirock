-- 교차검증(Codex 사실 확인)에서 지적된 공개 문제의 해설·문구 수정. 정답은 바꾸지 않는다.
-- 재업로드는 같은 문구를 건너뛰므로 운영 DB는 이 마이그레이션으로 고친다.
-- 옛 문구와 정확히 일치할 때만 바꾸므로 관리자 화면에서 이미 고친 문제는 그대로 두고, 해당 문제가 없는 DB에서는 아무 일도 하지 않는다.

UPDATE "Question" SET "explanation" = '양서류는 대체로 어릴 때는 물에서, 자라서는 물과 땅을 오가며 사는 척추동물로, 개구리·도롱뇽 등이 있습니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '개구리처럼 어릴 때는 물속에서 아가미로 숨 쉬고, 자라서는 폐와 피부로 숨 쉬는 동물 무리를 세 글자로 무엇이라고 하나요?' AND "explanation" = '양서류는 물과 땅 양쪽에서 사는 척추동물로, 개구리·도롱뇽 등이 있습니다.';

UPDATE "Question" SET "explanation" = '생산자는 주로 광합성으로 양분을 만들고, 이를 먹는 동물은 소비자, 죽은 생물을 분해하는 생물은 분해자입니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '먹이 사슬에서 햇빛을 이용해 스스로 양분을 만드는 식물 같은 생물을 세 글자로 무엇이라고 하나요?' AND "explanation" = '생산자는 광합성으로 양분을 만들고, 이를 먹는 동물은 소비자, 죽은 생물을 분해하는 생물은 분해자입니다.';

UPDATE "Question" SET "explanation" = '안개는 지표 부근 공기 속의 수증기가 응결해 생긴 작은 물방울이 떠 있는 것으로, 공기가 냉각될 때 잘 생깁니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '공기 중의 수증기가 지표 가까이에서 작은 물방울로 맺혀 떠 있어 앞이 뿌옇게 보이는 현상을 두 글자로 무엇이라고 하나요?' AND "explanation" = '안개는 지표 부근의 공기가 냉각되어 수증기가 응결한 작은 물방울이 떠 있는 것입니다.';

UPDATE "Question" SET "explanation" = '원자는 (+)전하를 띤 원자핵과 그 주위의 (-)전하를 띤 전자로 이루어져 있습니다. 가장 흔한 수소의 원자핵은 예외적으로 양성자 하나뿐입니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '원자의 중심에 있으며 양성자와 중성자로 이루어진 부분을 세 글자로 무엇이라고 하나요?' AND "explanation" = '원자는 (+)전하를 띤 원자핵과 그 주위의 (-)전하를 띤 전자로 이루어져 있습니다.';

UPDATE "Question" SET "explanation" = '분자는 물처럼 분자로 이루어진 물질의 성질을 나타내는 가장 작은 입자로, 물 분자는 수소 원자 2개와 산소 원자 1개로 이루어져 있습니다. 소금 같은 이온 화합물에는 독립된 분자가 없습니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '물질의 고유한 성질을 가지는 가장 작은 입자로, 원자가 결합하여 만들어진 것을 두 글자로 무엇이라고 하나요?' AND "explanation" = '분자는 물질의 성질을 나타내는 가장 작은 입자로, 물 분자는 수소 원자 2개와 산소 원자 1개로 이루어져 있습니다.';

UPDATE "Question" SET "explanation" = '표층 해류는 주로 바람에 의해 생기고, 깊은 바다의 해류는 수온·염분에 따른 밀도 차이로 생깁니다. 따뜻한 난류와 차가운 한류가 있습니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '바닷물이 일정한 방향으로 오랫동안 흐르는 것을 두 글자로 무엇이라고 하나요?' AND "explanation" = '해류는 주로 바람에 의해 생기며, 따뜻한 난류와 차가운 한류가 있습니다.';

UPDATE "Question" SET "explanation" = '식물은 낮과 밤 모두 호흡합니다. 광합성은 빛이 있을 때만 일어납니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '식물은 낮에만 호흡하고 밤에는 호흡하지 않는다.' AND "explanation" = '식물은 낮과 밤 모두 호흡합니다. 광합성은 빛이 있는 낮에만 일어납니다.';

UPDATE "Question" SET "explanation" = '달에는 대기가 거의 없어 공기를 통해서는 소리가 전달되지 않습니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '달은 공기가 많아 지구보다 소리가 더 잘 전달된다.' AND "explanation" = '달에는 대기가 거의 없어 소리를 전달할 물질이 없으므로 소리가 전달되지 않습니다.';

UPDATE "Question" SET "question" = '단위 넓이에 수직으로 작용하는 힘의 크기를 두 글자로 무엇이라고 하나요?', "normalizedText" = '단위넓이에수직으로작용하는힘의크기를두글자로무엇이라고하나요', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '일정한 넓이에 수직으로 작용하는 힘의 크기를 두 글자로 무엇이라고 하나요?';

UPDATE "Question" SET "explanation" = '감수 분열은 연속 두 번 분열하여 염색체 수가 체세포의 절반인 세포를 만들며, 동물에서는 이 세포가 생식세포가 됩니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '생식세포를 만들 때 일어나 염색체 수가 절반으로 줄어드는 세포 분열을 무엇이라고 하나요? (띄어쓰기 없이)' AND "explanation" = '감수 분열은 연속 두 번 분열하여 염색체 수가 체세포의 절반인 생식세포를 만듭니다.';

UPDATE "Question" SET "explanation" = '부정합은 퇴적이 오랫동안 끊겼던 흔적으로, 흔히 지층이 융기·침식된 뒤 다시 침강하여 그 위에 새 지층이 쌓이면서 만들어집니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '위아래 지층이 쌓이는 사이에 오랜 침식 기간이 있어 서로 불연속하게 만나는 관계를 세 글자로 무엇이라고 하나요?' AND "explanation" = '부정합은 퇴적이 멈추고 지층이 융기·침식된 뒤 다시 침강하여 퇴적이 일어났음을 알려 줍니다.';

UPDATE "Question" SET "explanation" = '화학적 성질은 주로 가장 바깥 껍질의 원자가 전자 수로 결정되며, 1·2족과 13~17족 같은 주족 원소는 같은 족이면 원자가 전자 수가 같습니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '주기율표에서 같은 족에 속한 원소들의 화학적 성질이 비슷한 까닭은 무엇인가요?' AND "explanation" = '화학적 성질은 주로 가장 바깥 껍질의 원자가 전자 수로 결정되며, 같은 족 원소는 원자가 전자 수가 같습니다.';

UPDATE "Question" SET "explanation" = '염분은 바닷물 1kg에 녹은 염류의 g 수로 나타내며, 전 세계 바다의 평균 염분은 약 35‰(퍼밀)입니다. 오늘날에는 전기 전도도로 정하는 실용 염분도 씁니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '바닷물 1kg 속에 녹아 있는 염류의 총량을 g 수로 나타낸 것을 두 글자로 무엇이라고 하나요?' AND "explanation" = '염분의 단위는 psu(실용 염분 단위)를 쓰며, 전 세계 바다의 평균 염분은 약 35 psu입니다.';

UPDATE "Question" SET "explanation" = '반감기는 방사성 동위 원소마다 일정하며, 탄소-14의 반감기(약 5,730년)는 유물의 연대 측정에 쓰입니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '방사성 원소의 양이 처음의 절반으로 줄어드는 데 걸리는 시간을 세 글자로 무엇이라고 하나요?' AND "explanation" = '반감기는 원소마다 일정하며, 탄소-14의 반감기(약 5,730년)는 유물의 연대 측정에 쓰입니다.';

UPDATE "Question" SET "explanation" = '수온 약층은 매우 안정하여 혼합층과 심해층 사이의 물질과 에너지 교환을 크게 억제합니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '해수의 혼합층과 심해층 사이에서 깊이에 따라 수온이 급격히 낮아지는 층을 네 글자로 무엇이라고 하나요?' AND "explanation" = '수온 약층은 매우 안정하여 혼합층과 심해층 사이의 물질과 에너지 교환을 막습니다.';

UPDATE "Question" SET "explanation" = '백신은 약화된 병원체나 항원, 또는 항원을 만들 유전 정보(mRNA 등)를 넣어 기억 세포를 만들게 하며, 이후 같은 항원이 들어오면 빠르고 강한 2차 면역 반응이 일어납니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '백신을 접종하면 질병을 예방할 수 있는 원리로 알맞은 것은 무엇인가요?' AND "explanation" = '백신은 약화된 병원체나 항원을 넣어 기억 세포를 만들게 하며, 이후 같은 항원이 들어오면 빠르고 강한 2차 면역 반응이 일어납니다.';

UPDATE "Question" SET "explanation" = '대부분의 효소는 단백질이라 최적 온도를 넘으면 변성되어 반응 속도가 급격히 떨어집니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '효소는 온도가 높아질수록 반응 속도가 한없이 빨라진다.' AND "explanation" = '효소는 단백질이라 최적 온도를 넘으면 변성되어 반응 속도가 급격히 떨어집니다.';

UPDATE "Question" SET "explanation" = '전력 P = VI이며 단위는 W(와트)입니다. 교류에서는 역률까지 고려해야 정확합니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '전기 기구의 소비 전력은 걸린 전압과 흐르는 전류의 곱이다.' AND "explanation" = '전력 P = VI이며 단위는 W(와트)입니다.';

UPDATE "Question" SET "explanation" = '등가속도 운동 공식은 v = v₀ + at, s = v₀t + ½at², v² = v₀² + 2as입니다. 여기서 s는 변위이며, 운동 방향이 바뀌지 않으면 이동 거리와 같습니다.', "question" = '등가속도 직선 운동에서 처음 속도 v₀, 나중 속도 v, 가속도 a, 변위 s 사이의 관계식으로 알맞은 것은 무엇인가요?', "normalizedText" = '등가속도직선운동에서처음속도v₀나중속도v가속도a변위s사이의관계식으로알맞은것은무엇인가요', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '등가속도 직선 운동에서 처음 속도 v₀, 나중 속도 v, 가속도 a, 이동 거리 s 사이의 관계식으로 알맞은 것은 무엇인가요?' AND "explanation" = '등가속도 운동 공식은 v = v₀ + at, s = v₀t + ½at², v² = v₀² + 2as입니다.';

UPDATE "Question" SET "explanation" = '다이오드는 순방향 전압에서는 전류가 잘 흐르고 역방향에서는 거의 흐르지 않는 정류 작용을 하여 교류를 직류로 바꾸는 데 쓰입니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = 'p-n 접합 다이오드의 주된 기능은 무엇인가요?' AND "explanation" = '다이오드는 순방향 전압에서만 전류가 흐르는 정류 작용을 하여 교류를 직류로 바꾸는 데 쓰입니다.';

UPDATE "Question" SET "explanation" = '광자의 에너지가 일함수 이상일 때 전자가 방출되며, 남는 에너지는 전자의 운동 에너지가 됩니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '금속 표면에서 전자 하나를 떼어 내는 데 필요한 최소 에너지를 세 글자로 무엇이라고 하나요?' AND "explanation" = '광자의 에너지가 일함수보다 클 때만 전자가 방출되며, 남는 에너지는 전자의 운동 에너지가 됩니다.';

UPDATE "Question" SET "explanation" = '퀘이사는 대부분 적색 편이가 커서 아주 먼 곳에 있는 천체로, 먼 퀘이사일수록 우주 초기의 모습을 보여 줍니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '은하 중심의 초대질량 블랙홀 주위에서 막대한 에너지를 방출하여 매우 먼 거리에서도 별처럼 보이는 천체를 외래어 세 글자로 무엇이라고 하나요?' AND "explanation" = '퀘이사는 적색 편이가 매우 커서 아주 먼 곳, 즉 우주 초기의 천체로 여겨집니다.';

UPDATE "Question" SET "explanation" = 'n=2로 전이하는 발머 계열은 가시광선 영역에 선이 나타나고(일부는 자외선), n=1로 전이하는 라이먼 계열은 자외선, n=3인 파셴 계열은 적외선 영역입니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '수소 원자의 선 스펙트럼 가운데 가시광선 영역에 나타나는 계열은 무엇인가요?' AND "explanation" = 'n=2로 전이하는 발머 계열은 가시광선, n=1로 전이하는 라이먼 계열은 자외선, n=3인 파셴 계열은 적외선 영역입니다.';

UPDATE "Question" SET "explanation" = '나일론은 단위체가 아마이드 결합으로 이어진 중합체로, 나일론 66은 다이아민과 다이카복실산이 물을 내놓으며 축합해 만들어집니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '나일론을 이루는 단위체 사이의 결합은 무엇인가요?' AND "explanation" = '나일론은 아민과 카복실산이 물을 내놓으며 결합한 아마이드 결합으로 이루어진 축합 중합체입니다.';

UPDATE "Question" SET "explanation" = '일반적으로 선구동물(연체동물·절지동물 등)은 원구가 입이 되고, 후구동물(극피동물·척삭동물)은 원구가 항문이 됩니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '발생 과정에서 처음 생긴 구멍(원구)이 입이 되는 동물 무리를 무엇이라고 하나요?' AND "explanation" = '선구동물(연체동물·절지동물 등)은 원구가 입이 되고, 후구동물(극피동물·척삭동물)은 원구가 항문이 됩니다.';

UPDATE "Question" SET "explanation" = '목성형 행성은 수소·헬륨 같은 가벼운 기체나 얼음 성분이 많아 질량과 반지름은 크지만 평균 밀도가 작고, 위성과 고리를 가집니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '목성형 행성의 특징으로 알맞은 것은 무엇인가요?' AND "explanation" = '목성형 행성은 주로 수소와 헬륨으로 이루어져 질량과 반지름은 크지만 평균 밀도가 작고, 위성과 고리를 가집니다.';

UPDATE "Question" SET "explanation" = '고인돌은 청동기 시대의 대표적인 무덤으로, 주로 지배층의 무덤으로 보지만 공동 무덤이나 기념물로 보기도 합니다. 우리나라 고인돌 유적은 유네스코 세계유산입니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '고인돌이 많이 만들어진 시대는 언제인가요?' AND "explanation" = '고인돌은 청동기 시대 지배층의 무덤으로, 우리나라 고인돌 유적은 유네스코 세계유산입니다.';

UPDATE "Question" SET "explanation" = '카스트 제도의 네 신분은 브라만·크샤트리아·바이샤·수드라이고 그 밖에 불가촉천민(달리트)도 있었으며, 오늘날 인도 헌법은 카스트 차별을 금지합니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '인도에서 사람을 태어날 때부터 정해진 계급으로 나누던 신분 제도를 외래어 세 글자로 무엇이라고 하나요?' AND "explanation" = '카스트 제도는 브라만·크샤트리아·바이샤·수드라로 나뉘며, 오늘날 인도 헌법은 카스트 차별을 금지합니다.';

UPDATE "Question" SET "explanation" = '수나라 때 시작된 과거제는 당·송을 거치며 정착해 1905년까지 이어졌습니다.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '중국에서 처음으로 시험을 통해 관리를 뽑는 과거제를 실시한 왕조는 어디인가요?' AND "explanation" = '수 문제가 처음 실시한 과거제는 당·송을 거치며 정착해 1905년까지 이어졌습니다.';

-- 답이 갈리는 문제의 조건 문구 보강
UPDATE "Question" SET "explanation" = '3~11족 원소는 전이 원소입니다. 12족은 교재에 따라 전이 원소에 넣기도 하고 빼기도 합니다.', "question" = '주기율표의 3~11족 원소는 전이 원소에 속한다.', "normalizedText" = '주기율표의311족원소는전이원소에속한다', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '전이 원소는 주기율표의 3~12족에 위치한다.';

UPDATE "Question" SET "question" = '서브권과 관계없이 매 랠리에서 이긴 쪽이 1점을 얻는 득점 방식은? (''제''는 빼고 쓰시오)', "normalizedText" = '서브권과관계없이매랠리에서이긴쪽이1점을얻는득점방식은제는빼고쓰시오', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '서브권과 관계없이 매 랠리에서 이긴 쪽이 1점을 얻는 득점 방식은?';

UPDATE "Question" SET "question" = '농구에서 공을 갖지 않은 공격 선수가 수비수의 등 뒤로 돌아 골 밑으로 파고들어 패스를 받는 움직임은? (세 글자)', "normalizedText" = '농구에서공을갖지않은공격선수가수비수의등뒤로돌아골밑으로파고들어패스를받는움직임은세글자', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '농구에서 공을 갖지 않은 공격 선수가 수비수의 등 뒤로 돌아 골 밑으로 파고들어 패스를 받는 움직임은?';

UPDATE "Question" SET "question" = '농구에서 공격 선수가 수비수의 진로에 몸으로 벽을 세워 동료가 자유롭게 움직이도록 돕는 기술은? (세 글자)', "normalizedText" = '농구에서공격선수가수비수의진로에몸으로벽을세워동료가자유롭게움직이도록돕는기술은세글자', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '농구에서 공격 선수가 수비수의 진로에 몸으로 벽을 세워 동료가 자유롭게 움직이도록 돕는 기술은?';

UPDATE "Question" SET "question" = '골프에서 한 홀을 기준 타수보다 4타 적게 마치는 매우 드문 기록은? (새 이름, 세 글자)', "normalizedText" = '골프에서한홀을기준타수보다4타적게마치는매우드문기록은새이름세글자', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '골프에서 한 홀을 기준 타수보다 4타 적게 마치는 매우 드문 기록은?';

UPDATE "Question" SET "question" = '빙하가 깎아 만든 U자 모양 골짜기에 바닷물이 들어와 생긴, 좁고 깊은 만으로 노르웨이 해안에 많은 지형은? (외래어 표기법 기준)', "normalizedText" = '빙하가깎아만든u자모양골짜기에바닷물이들어와생긴좁고깊은만으로노르웨이해안에많은지형은외래어표기법기준', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '빙하가 깎아 만든 U자 모양 골짜기에 바닷물이 들어와 생긴, 좁고 깊은 만으로 노르웨이 해안에 많은 지형은?';

UPDATE "Question" SET "question" = '포르투갈의 수도는? (외래어 표기법 기준)', "normalizedText" = '포르투갈의수도는외래어표기법기준', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '포르투갈의 수도는?';

UPDATE "Question" SET "question" = '몽골의 수도는? (외교부 표기 기준)', "normalizedText" = '몽골의수도는외교부표기기준', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '몽골의 수도는? (외래어 표기법 기준)';

UPDATE "Question" SET "question" = '부탄의 수도는? (외교부 표기 기준)', "normalizedText" = '부탄의수도는외교부표기기준', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '부탄의 수도는? (외래어 표기법 기준)';

UPDATE "Question" SET "question" = '브루나이의 수도는? (외래어 표기법 기준)', "normalizedText" = '브루나이의수도는외래어표기법기준', "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = '브루나이의 수도는?';
