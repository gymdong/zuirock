-- 교차검증이 사람 확인을 요청한 문제 표시(관리자 화면 '검증 필요' 필터). null = 확인할 것 없음.
-- 문구가 일치하는 문제에만 표시하므로 관리자 화면에서 문구를 고친 문제와 업로드되지 않은 문제는 건너뛴다.
ALTER TABLE "Question" ADD COLUMN "reviewFlag" TEXT;

UPDATE "Question" SET "reviewFlag" = 'claude 사실 확인 ambiguous: 표준국어대사전 표제는 ''떡 줄 사람은 꿈도 아니 꾸는데 김칫국부터 마신다''로 문제의 ''생각도 않는데'' 형태와 다를 수 있다(정답 김칫국은 유일). (근거: 사전 미확인(기억 기반 검수))' WHERE "normalizedText" = '해줄사람은생각지도않는데미리부터다된일로알고기대함을이르는속담떡줄사람은꿈도안꾸는데부터마신다의빈칸에들어갈말은세글자';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "말꼬리" ≠ 정답 "꼬투리"' WHERE "normalizedText" = '남의사소한말이나행동을트집잡는다는뜻의표현를잡다의빈칸에들어갈말은세글자';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "비위" ≠ 정답 "눈꼴"' WHERE "normalizedText" = '하는짓이거슬려보기에아니꼽다는뜻의표현이시다의빈칸에들어갈말은두글자';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 답 불일치: 풀이 "몽니" ≠ 정답 "어깃장"' WHERE "normalizedText" = '순순히따르지않고일부러뻗대며반대하는행동을한다는뜻의표현을놓다의빈칸에들어갈말은첫글자가어인세글자';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 wrong: 정답은 맞지만 해설의 마지막 문장이 틀렸다. ‘오금이 붙다’는 팔다리가 잘 움직이지 않는다는 뜻이다. 두려워 꼼짝 못 한다는 표현은 ‘오금을 못 쓰다’이다. (근거: 표준국어대사전 뜻풀이를 제공하는 WORDROW ‘오금’ 항목: https://idiom.wordrow.kr/구성어/오금01/ ; 한국경제의 관용구 설명: https://sgsg.hankyung.com/article/2009092343511)' WHERE "normalizedText" = '관용구오금을박다의뜻으로알맞은것은';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "간만" ≠ 정답 "오랜만"' WHERE "normalizedText" = '오래간만의준말을바른표기로쓰면무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 ambiguous: 설명은 마흔 살을 가리키지만 ‘불혹’의 초성 ㄱㅁ과 일치하지 않습니다. 채점은 답의 초성 힌트로 이뤄지므로 이 문항은 정답 ‘불혹’을 초성으로 구별해 제시하지 않습니다. (근거: 문항 자체에 제시된 답 ‘불혹’과 초성 ‘ㅂㅎ’가 불일치합니다.)' WHERE "normalizedText" = '마흔살을달리이르는말로세상일에정신을빼앗겨판단을흐리는일이없다는뜻의한자어는무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "어떡해" ≠ 정답 "어떻게"' WHERE "normalizedText" = '큰일났다이제하지의빈칸에알맞은것은무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "희귀하다" ≠ 정답 "희한하다"' WHERE "normalizedText" = '매우드물거나신기하다는뜻의형용사기본형을바른표기로쓰면무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "견디다" ≠ 정답 "무릅쓰다"' WHERE "normalizedText" = '힘든일이나위험을그대로참고견디다는뜻의동사기본형을바른표기로쓰면무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "자처하다" ≠ 정답 "내로라하다" (메모: 문맥에 따라 ‘대표하다’도 가능하지만, 스스로 내세운다는 뜻의 후보입니다.)' WHERE "normalizedText" = '어떤분야를대표할만하다고스스로내세우거나남들이인정한다는뜻의동사기본형을바른표기로쓰면무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "다그치다" ≠ 정답 "닦달하다"' WHERE "normalizedText" = '남을단단히윽박질러서혼을내다는뜻의동사기본형을바른표기로쓰면무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "주책맞다" ≠ 정답 "어쭙잖다"' WHERE "normalizedText" = '비웃음을살만큼언행이분수에넘치는데가있다는뜻의형용사기본형을바른표기로쓰면무엇인가요네글자';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "컨대" ≠ 정답 "생각건대"' WHERE "normalizedText" = '생각하건대가줄어든말을바른표기로쓰면무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "어른" ≠ 정답 "웃어른"' WHERE "normalizedText" = '나이나지위신분항렬따위가자기보다높아서모셔야하는어른을바른표기로쓰면무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "X" ≠ 정답 "O"' WHERE "normalizedText" = '숫양숫염소숫쥐는접두사숫을쓰는것이표준이다';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "O" ≠ 정답 "X"' WHERE "normalizedText" = '상치는상추와함께쓰는복수표준어이다';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "주저하다" ≠ 정답 "서슴다"' WHERE "normalizedText" = '말이나행동을결단성있게하지못하고머뭇거리며망설이다는뜻의동사기본형은무엇인가요세글자';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "뒤엉키다" ≠ 정답 "얽히고설키다"' WHERE "normalizedText" = '이리저리복잡하게뒤섞여엉키다는뜻의동사기본형을띄어쓰기없이바른표기로쓰면무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "낙양지귀" ≠ 정답 "낙양지가"
codex 사실 확인 ambiguous: ‘낙양지가’의 관용적 뜻은 저서가 호평받아 널리 읽히는 것이지만, 해설의 ‘잘 팔림’은 뜻풀이와 같지 않아 서점에서의 판매로 좁혀 오해하게 할 수 있습니다. (근거: 표준국어대사전 표제어 뜻풀이를 직접 확인할 수 있는 주소는 검색에서 확인하지 못했습니다.)' WHERE "normalizedText" = '좌사의삼도부가인기를끌어사람들이베껴쓰느라종이값이올랐다는데서나온말로책이널리읽혀크게호평받음을이르는사자성어는무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 wrong: ‘망양보뢰’의 현재 사전적 뜻은 양을 잃고 우리를 고친다는 데서, 이미 실패한 뒤 뉘우쳐도 소용없음을 이르는 말입니다. 해설은 이 뜻과 맞지만, 보기의 ‘소 잃고 외양간 고친다’는 속담 풀이에 ‘바로잡으려고 애써도 소용없다’가 있어 뜻은 유사합니다. 문항 자체는 정답이 맞습니다. (근거: 국립국어원 한국어기초사전 속담 풀이: https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=64289)' WHERE "normalizedText" = '망양보뢰亡羊補牢와뜻이가장비슷한속담은무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "일흔일곱 살" ≠ 정답 "아흔 살"' WHERE "normalizedText" = '졸수卒壽는몇살을이르는말인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 풀이 확신 낮음 (메모: 같은 뜻의 사자성어 ‘마부위침’도 가능함.)' WHERE "normalizedText" = '도끼를갈아바늘을만든다는뜻으로아무리어려운일이라도꾸준히노력하면이룰수있음을이르는사자성어는무엇인가요네글자';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "학철지부" ≠ 정답 "학철부어"' WHERE "normalizedText" = '수레바퀴자국에괸물에있는붕어라는뜻으로매우위급한처지에있거나몹시곤궁한사람을이르는사자성어는무엇인가요네글자';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 풀이 확신 낮음 (메모: ''의원''을 의회의 한 원(院)으로 해석하면 O. 국회의원 한 사람이라는 뜻이면 X.)' WHERE "normalizedText" = '대한민국국회는하나의의원으로이루어진단원제이다';

UPDATE "Question" SET "reviewFlag" = 'claude 사실 확인 ambiguous: 외래어 표기 정답은 크레셴도지만 크레센도 표기도 흔히 쓰여 입력 정답이 갈릴 수 있음 (근거: 국립국어원 외래어 표기: crescendo=크레셴도; 교과서·일상에서 크레센도 병용)' WHERE "normalizedText" = '악보에서점점세게를뜻하는이탈리아어음악용어는무엇인가요외래어표기법기준';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 답 불일치: 풀이 "알바트로스" ≠ 정답 "이글"' WHERE "normalizedText" = '골프에서한홀의기준타수보다2타적게쳐서홀에넣는것을무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 ambiguous: 같은 초성 ㄹㅂㄹㅈ의 ''레버러지''도 금융기관에서 사용하는 표기여서, ''레버리지''만 완전 일치로 인정하면 정답 처리에 문제가 생긴다. (근거: KDI 경제교육·정보센터는 ''레버리지'', 대신증권은 ''레버러지(Leverage)''를 사용한다. https://eiec.kdi.re.kr/material/echannView.do?idx=578&type=00002000240000100006 ; https://money2.daishin.com/html/WTS/Customer/GuideUser/DW05_CUS_INF_018.html)' WHERE "normalizedText" = '빌린돈같은타인자본을지렛대삼아투자수익률을높이는것을외래어로무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 풀이 확신 낮음 (메모: 길게 이어 찍는다는 점에서는 롱테이크이며, 한 번의 촬영이라는 점에서는 원테이크도 가능하다.)' WHERE "normalizedText" = '영화에서장면을끊지않고하나의카메라촬영으로길게이어찍는기법을외래어로무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 wrong: 정답은 맞지만 해설이 공인중개사와 개업공인중개사를 혼동한다. 공인중개사는 자격을 취득한 사람이며, 중개사무소 개설등록은 공인중개사 자격 자체의 요건이 아니다. (근거: 국가법령정보센터 공인중개사법 제2조는 공인중개사를 자격 취득자로, 개업공인중개사를 중개사무소 개설등록을 한 자로 구분한다. https://law.go.kr/LSW/LsiJoLinkP.do?docType=JO&joNo=003000000&languageType=KO&lsNm=%EA%B3%B5%EC%9D%B8%EC%A4%91%EA%B0%9C%EC%82%AC%EB%B2%95&paras=1)' WHERE "normalizedText" = '부동산을사고팔거나빌리는거래를법에따른자격을갖추고중간에서연결해주는사람을무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'claude 사실 확인 ambiguous: 표준 표기 애덤스미스 외에 아담스미스 표기가 널리 쓰여 입력 정답이 갈릴 수 있음 (근거: 외래어 표기법 Adam Smith=애덤 스미스; 아담 스미스 관용 표기 다수)' WHERE "normalizedText" = '국부론을써서보이지않는손이라는표현으로시장의자율적조정을설명한경제학자는누구인가요외래어표기법기준띄어쓰기없이';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 ambiguous: ''베블런효과''와 ''베블렌효과''가 모두 쓰이며 초성도 ㅂㅂㄹㅎㄱ로 같아 완전 일치 채점에서 정답이 갈립니다. (근거: 정부 정책주간지 K-공감에서도 ''베블렌 효과'' 표기를 사용합니다. https://gonggam.korea.kr/newsContentView.es?b_list=9&code_cd=&content=&mid=a12700000000&nPage=536&news_id=EBC6D40110514203E0540021F662AC5F&section_id=NCCD_PUBLISH)' WHERE "normalizedText" = '가격이오를수록과시하려는심리때문에오히려수요가늘어나는현상을무엇이라고하나요띄어쓰기없이';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 답 불일치: 풀이 "주택담보대출비율" ≠ 정답 "담보인정비율"' WHERE "normalizedText" = '주택담보대출에서ltv를우리말로무엇이라고하나요여섯글자띄어쓰기없이';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 wrong: 정답은 로부스타가 맞지만, 아라비카·카네포라는 엄밀히 품종이 아니라 종입니다. 또한 콜롬비아를 산지나 상표로만 설명하면 부정확합니다. ''콜롬비아''라는 실제 육성 품종도 있습니다. (근거: World Coffee Research는 두 종과 그 아래 품종을 구분합니다. https://varieties.worldcoffeeresearch.org/about-the-catalog/whats-included 콜롬비아 커피생산자연합은 1982년 개발된 Colombia 품종을 소개합니다. https://quindio.federaciondecafeteros.org/glosario/variedad-colombia/)' WHERE "normalizedText" = '세계커피생산량의대부분을차지하는두가지커피나무품종은아라비카와무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '시장의한계를바로잡으려는공공부문의개입이오히려비효율이나자원낭비를낳는현상을네글자로무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 ambiguous: 같은 기법을 ‘키아로스큐로’라고도 표기한다. 두 표기의 초성이 모두 ㅋㅇㄹㅅㅋㄹ여서 완전 일치 채점으로는 타당한 답을 오답 처리할 수 있다. (근거: 한국연구재단 KCI에 등재된 논문에서 ‘키아로스큐로’를 빛과 어둠의 극적 대조 기법으로 설명한다. https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002151303)' WHERE "normalizedText" = '카라바조렘브란트의그림처럼빛과어둠의강한대비로입체감과극적효과를내는기법을이탈리아어용어로무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '밥국김치장류를기본으로하고반찬가짓수에따라3첩5첩7첩등으로나누는한국전통일상상차림을무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "기초생활보장제도" ≠ 정답 "기초생활보장"' WHERE "normalizedText" = '생활이어려운사람에게생계의료주거교육급여를주어최저생활을보장하는제도를무엇이라고하나요띄어쓰기없이국민은빼고';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 답 불일치: 풀이 "극" ≠ 정답 "자극"' WHERE "normalizedText" = '막대자석에서철을끌어당기는힘이가장센양끝부분을두글자로무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '동물세포에서유전물질dna이들어있고세포의생명활동을조절하는구조를세글자로무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '움직이는물체가가진에너지로질량에비례하고속력의제곱에비례하는에너지를무엇이라고하나요띄어쓰기없이';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 풀이 확신 낮음 (메모: 신호 전달 부위 전체는 시냅스이며, 문장에서 말한 좁은 틈 자체는 시냅스틈이다.)
codex 사실 확인 wrong: 문제에서 시냅스를 뉴런 사이의 좁은 틈 자체로 정의했습니다. 틈은 ''시냅스 틈''이고, 시냅스는 시냅스 전·후 구조를 포함하는 신호 전달 접합부입니다. (근거: NCBI Bookshelf, Neuroscience의 Chemical Synapses: 시냅스 구조와 시냅스 틈을 구분합니다. https://www.ncbi.nlm.nih.gov/books/NBK11009/)' WHERE "normalizedText" = '한뉴런의축삭돌기끝과다음뉴런사이의좁은틈으로신경전달물질을통해신호가전달되는부위를무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 ambiguous: ''라니냐''와 ''라니나''가 같은 현상을 가리키는 표기로 기관 자료에서 함께 쓰이며 초성도 ㄹㄴㄴ으로 같습니다. 완전 일치 채점에서는 ''라니나''가 오답 처리됩니다. (근거: 기상청 「WMO 발표에 대한 기상청 추가 설명」에서 ''라니냐''와 ''라니나''를 함께 사용합니다. https://www.kma.go.kr/kma/servlet/NeoboardProcess?bid=press&callback=https%3A%2F%2Fwww.kma.go.kr%2Fkma%2Fnews%2Fpress.jsp&fno=2&k=ATC201712221005542_940ba53e-22fb-41a4-9f92-0301ccbf46c0.pdf&mode=download&num=1193466&ses=USERSESSION)' WHERE "normalizedText" = '적도부근동태평양의해수면온도가평년보다낮은상태로수개월이상지속되는현상을무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 wrong: 정답은 맞지만 전사의 장소에 관한 해설에 예외가 누락되어 있습니다. 진핵세포에서는 핵뿐 아니라 미토콘드리아와 엽록체에서도 자체 DNA의 전사가 일어납니다. (근거: NCBI Bookshelf, Molecular Biology of the Cell: 미토콘드리아 기질과 엽록체 스트로마에서 소기관 DNA의 전사가 일어남. https://www.ncbi.nlm.nih.gov/books/NBK26924/)' WHERE "normalizedText" = 'dna의유전정보를바탕으로rna가만들어지는과정을무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '다윈이진화의주요원리로제시한것으로환경에더잘적응한개체가더많이살아남아자손을남기는과정을무엇이라고하나요띄어쓰기없이';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 ambiguous: ''판게아''와 ''팡게아''가 같은 초대륙의 이름으로 쓰이며 초성도 ㅍㄱㅇ로 같습니다. 완전 일치 채점에서는 타당한 다른 표기가 오답 처리됩니다. (근거: 과학교사 김정식의 과학사랑에서 동일한 초대륙에 ''판게아''와 ''팡게아''를 함께 사용함. https://sciencelove.com/2195)' WHERE "normalizedText" = '베게너가대륙이동설에서제시한약3억년전지구의대륙들이하나로모여있던초대륙의이름은무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 wrong: 정답은 맞지만 자기 선속이 변하면 반드시 전류가 흐른다는 해설은 부정확합니다. 유도 기전력이 생기며, 유도 전류가 흐르려면 회로가 닫혀 있어야 합니다. (근거: OpenStax College Physics 23.1: 자기 선속의 변화는 유도 기전력을 만들며 전류에는 흐를 경로가 필요함. https://openstax.org/books/college-physics/pages/23-1-induced-emf-and-magnetic-flux)' WHERE "normalizedText" = '코일속을지나는자기장이변할때코일에전류가흐르게되는현상을무엇이라고하나요띄어쓰기없이';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 풀이 확신 낮음 (메모: 일반적인 정답은 S파이지만, 러브파도 고체에서 전파되는 전단파이므로 문장만으로는 복수 해석이 가능합니다.)
codex 사실 확인 ambiguous: 보기의 러브파도 고체에서 전파되고 액체는 통과하지 못하므로 정답이 하나로 정해지지 않습니다. 질문을 지진파 중 ''실체파''로 한정해야 합니다. (근거: 미국 연방재난관리청(FEMA)은 러브파도 S파처럼 액체를 통과하지 못한다고 설명합니다. https://training.fema.gov/emiweb/is/is8a/is8a-unit3.pdf)' WHERE "normalizedText" = '지진파중고체만통과하고액체는통과하지못하는파동은무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '압력이일정할때기체의부피는절대온도에비례한다는법칙에이름이붙은프랑스과학자는누구인가요성으로답하시오';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 ambiguous: 벤젠의 동의어 ''벤졸''도 초성이 ㅂㅈ이고 문제의 설명에 해당하므로 완전 일치 채점에서는 복수 정답 문제가 생깁니다. (근거: 국립국어원 온용어의 ''벤졸'' 항목은 분자식 C₆H₆의 정육각형 방향족 화합물로 정의하며 ''벤젠''을 동의어로 제시합니다. https://kli.korean.go.kr/term/trgtWord/indexTrgtWord.do?trgtWordNo=2201117)' WHERE "normalizedText" = '분자식이c₆h₆이고탄소원자6개가정육각형고리모양으로결합한대표적인방향족탄화수소는무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 wrong: 정답은 맞지만 해설의 ''세포막처럼 물만 통과하는 막''은 사실과 다릅니다. 세포막은 물 외에도 기체와 여러 물질을 선택적으로 통과시킵니다. (근거: 미국 국립일반의학연구소(NIGMS)는 세포막의 지질 이중층을 작은 분자와 기체가 통과하며, 크거나 전하를 띤 분자는 막단백질을 통해 이동한다고 설명합니다. https://nigms.nih.gov/biobeat/2021/12/science-snippet-the-marvels-of-membranes)' WHERE "normalizedText" = '반투과성막을사이에두고용매인물이농도가낮은쪽에서높은쪽으로이동하는현상을두글자로무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '지구의외핵은주로철과니켈로이루어져있다';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '두개의동일한페르미온은같은양자상태를동시에차지할수없다는배타원리를제안한물리학자는누구인가요성으로답하시오';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '산소o₂와오존o₃처럼같은원소로이루어져있지만원자배열이나결합이달라성질이다른홑원소물질들의관계를무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 답 불일치: 풀이 "센트로미어" ≠ 정답 "동원체"' WHERE "normalizedText" = '세포분열때염색체가양극으로분리될수있도록방추사가부착되는염색체의잘록한부위를무엇이라고하나요우리말용어로';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "동적평형" ≠ 정답 "화학평형"' WHERE "normalizedText" = '가역반응에서정반응과역반응의속도가같아져겉보기에변화가없는상태를무엇이라고하나요띄어쓰기없이네글자';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "단량체" ≠ 정답 "단위체"' WHERE "normalizedText" = '폴리에틸렌의에틸렌처럼고분자를이루는작은반복단위분자를세글자로무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 답 불일치: 풀이 "서비스에이스" ≠ 정답 "에이스" (메모: 에이스나 서브에이스라고도 한다.)' WHERE "normalizedText" = '테니스에서서브한공에상대가라켓을대지도못해서버가바로얻은점수를이르는말은';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 풀이 확신 낮음 (메모: 서브폴트라고도 한다.)' WHERE "normalizedText" = '테니스에서서브한공이서비스코트밖에떨어지는등서브에실패한것을이르는말은';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 풀이 확신 낮음 (메모: 퍼펙트게임도 안타와 실점을 허용하지 않지만, 주자의 출루까지 없어야 한다.)' WHERE "normalizedText" = '야구에서상대팀에안타와점수를하나도내주지않고이긴경기를이르는말은';

UPDATE "Question" SET "reviewFlag" = 'claude 사실 확인 wrong: 정답(이순신)은 맞으나 해설 오류: 옥포 해전에는 거북선이 참전하지 않았고(첫 참전은 사천 해전), 명량 해전 때는 칠천량 패전으로 거북선이 없었다. (근거: 거북선 첫 출전 1592년 사천 해전; 명량 해전은 판옥선 13척으로 치름)' WHERE "normalizedText" = '임진왜란때거북선을이끌고왜군을무찌른장군은누구인가요';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '1492년에스파냐의후원을받아대서양을건너아메리카에도착한탐험가는누구인가요';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '루비콘강을건너며주사위는던져졌다는말을남긴로마의장군이자정치가를라틴어식이름으로무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 풀이 확신 낮음 (메모: 군대는 십자군이며, 원정을 가리키면 십자군원정 또는 십자군전쟁도 가능하다.)
claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '11세기말부터서유럽크리스트교세력이성지예루살렘을되찾는다는명분으로일으킨원정또는그군대를무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '그리스에서인도서북부에이르는대제국을건설해헬레니즘문화의바탕을마련한마케도니아왕을그리스식이름으로무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 wrong: 정답과 해설은 맞지만, 문제의 ‘피를 흘리지 않고’라는 표현은 부정확합니다. 잉글랜드에서도 무력 충돌과 사망자가 발생했습니다. ‘비교적 적은 유혈로’로 수정하는 것이 정확합니다. (근거: 버크셔 지방사협회연합의 사료 연구는 1688년 레딩 전투와 전사자의 매장 기록, 윈캔턴의 무력 충돌을 확인합니다. https://www.blha.org.uk/wp-content/uploads/2025/11/BOAN-2024.pdf)' WHERE "normalizedText" = '1688년영국에서피를흘리지않고국왕을몰아내고권리장전을승인받은혁명을무엇이라고하나요띄어쓰기없이';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '중세서유럽에서주군이봉신에게토지를주고봉신은충성과군사적봉사를약속한주종관계와장원제를바탕으로한사회체제를네글자로무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '고려광종때후주출신쌍기의건의로처음시행된관리선발시험제도를두글자로무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '명나라영락제때대함대를이끌고동남아시아와인도양을지나아프리카동해안까지항해한환관은누구인가요성명두글자';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 wrong: 정답 경기도는 맞지만, 해설의 ''전국으로 확대''는 시행 제외 지역을 누락했습니다. 평안도·함경도·제주도는 제외되었습니다. (근거: 국사편찬위원회 우리역사넷은 평안도·함경도·제주도를 제외한 전국으로 확대되었다고 설명합니다. https://contents.history.go.kr/mobile/ta/view.do?levelId=ta_m42_0030_0010)' WHERE "normalizedText" = '광해군때공납을쌀등으로내게한대동법이처음시행된지역은어디인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 wrong: 해설의 ''직통 전화''는 부정확하다. 1963년 설치된 미·소 직통 통신망은 음성 전화가 아니라 텔레타이프를 이용한 문자 통신망이었다. (근거: 미 육군의 MOLINK 설명: https://www.army.mil/article/109986/Hotline__now_50_years_old__continues_to_promote_dialog_with_Russians/)' WHERE "normalizedText" = '1962년소련이쿠바에미사일기지를건설하려다미국과핵전쟁직전까지간사건은무엇인가요';

UPDATE "Question" SET "reviewFlag" = 'codex 사실 확인 wrong: 정답은 맞지만 해설은 1532년에 잉카 제국까지 무너뜨린 것으로 서술한다. 1532년은 황제 생포 시점이며, 황제 처형과 제국 장악은 1533년이다. (근거: 스미스소니언 국립아메리칸인디언박물관 연표는 1532년 생포와 1533년 제국 장악을 구분한다: https://americanindian.si.edu/nk360/inka-innovation/timeline/timeline)' WHERE "normalizedText" = '16세기소수의병력으로잉카제국을정복한에스파냐의정복자는누구인가요성으로답하시오';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '기원전2세기한나라무제의명으로대월지에사신으로가서역의사정을알리고비단길개척의계기를만든인물은누구인가요성명두글자';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음' WHERE "normalizedText" = '고려초지방향리의자제를개경에머물게하여지방세력을견제한정책을네글자로무엇이라고하나요';

UPDATE "Question" SET "reviewFlag" = 'claude 블라인드 풀이 확신 낮음
codex 사실 확인 wrong: 정답은 맞지만, 1077년 당시 하인리히 4세는 독일왕이었으며 황제 즉위는 1084년이다. 문제의 당시 직함을 수정해야 한다. (근거: 독일 역사박물관 Deutschlandmuseum은 카노사 사건을 1077년, 황제 대관을 1084년으로 설명한다. https://www.deutschlandmuseum.de/en/history/calendar/1077-01-25-king-vs-pope-the-investiture-controversy/)' WHERE "normalizedText" = '1077년신성로마제국황제하인리히4세가이탈리아의성에서눈속에서서교황그레고리우스7세에게용서를빈사건을무엇이라고하나요띄어쓰기없이';

UPDATE "Question" SET "reviewFlag" = 'codex 블라인드 풀이 확신 낮음 (메모: 평정해산도 같은 지형을 가리킨다.)' WHERE "normalizedText" = '해저화산의꼭대기가파도에깎여평평해진뒤가라앉아생긴정상이평평한해산은';
