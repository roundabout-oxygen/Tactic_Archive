// Master Blue Archive Student Directory with Furigana (Reading)
const STUDENT_MASTER_LIST = [
  {
    "reading": "あかね（ばにー）",
    "name": "アカネ（バニー）"
  },
  {
    "reading": "あかね（せいふく）",
    "name": "アカネ（制服）"
  },
  {
    "reading": "あかり（しょうがつ）",
    "name": "アカリ（正月）"
  },
  {
    "reading": "あこ",
    "name": "アコ"
  },
  {
    "reading": "あこ（どれす）",
    "name": "アコ（ドレス）"
  },
  {
    "reading": "あずさ",
    "name": "アズサ"
  },
  {
    "reading": "あずさ（みずぎ）",
    "name": "アズサ（水着）"
  },
  {
    "reading": "あすな（ばにー）",
    "name": "アスナ（バニー）"
  },
  {
    "reading": "あすな（せいふく）",
    "name": "アスナ（制服）"
  },
  {
    "reading": "あつこ",
    "name": "アツコ"
  },
  {
    "reading": "あつこ（みずぎ）",
    "name": "アツコ（水着）"
  },
  {
    "reading": "ありす",
    "name": "アリス"
  },
  {
    "reading": "ありす（めいど）",
    "name": "アリス（メイド）"
  },
  {
    "reading": "ありす（りんせん）",
    "name": "アリス（臨戦）"
  },
  {
    "reading": "ある",
    "name": "アル"
  },
  {
    "reading": "ある（しょうがつ）",
    "name": "アル（正月）"
  },
  {
    "reading": "ある（どれす）",
    "name": "アル（ドレス）"
  },
  {
    "reading": "いおり",
    "name": "イオリ"
  },
  {
    "reading": "いおり（みずぎ）",
    "name": "イオリ（水着）"
  },
  {
    "reading": "いずな",
    "name": "イズナ"
  },
  {
    "reading": "いずな（みずぎ）",
    "name": "イズナ（水着）"
  },
  {
    "reading": "いずみ",
    "name": "イズミ"
  },
  {
    "reading": "いずみ（しょうがつ）",
    "name": "イズミ（正月）"
  },
  {
    "reading": "いちか",
    "name": "イチカ"
  },
  {
    "reading": "いぶき（みずぎ）",
    "name": "イブキ（水着）"
  },
  {
    "reading": "いろは",
    "name": "イロハ"
  },
  {
    "reading": "いろは（みずぎ）",
    "name": "イロハ（水着）"
  },
  {
    "reading": "うい",
    "name": "ウイ"
  },
  {
    "reading": "うい（みずぎ）",
    "name": "ウイ（水着）"
  },
  {
    "reading": "うたは（おうえんだん）",
    "name": "ウタハ（応援団）"
  },
  {
    "reading": "うみか",
    "name": "ウミカ"
  },
  {
    "reading": "えいみ",
    "name": "エイミ"
  },
  {
    "reading": "えいみ（みずぎ）",
    "name": "エイミ（水着）"
  },
  {
    "reading": "えいみ（りんせん）",
    "name": "エイミ（臨戦）"
  },
  {
    "reading": "えり",
    "name": "エリ"
  },
  {
    "reading": "えりか",
    "name": "エリカ"
  },
  {
    "reading": "かえで",
    "name": "カエデ"
  },
  {
    "reading": "かすみ",
    "name": "カスミ"
  },
  {
    "reading": "かずさ",
    "name": "カズサ"
  },
  {
    "reading": "かずさ（ばんど）",
    "name": "カズサ（バンド）"
  },
  {
    "reading": "かのえ",
    "name": "カノエ"
  },
  {
    "reading": "かほ",
    "name": "カホ"
  },
  {
    "reading": "かよこ（しょうがつ）",
    "name": "カヨコ（正月）"
  },
  {
    "reading": "かよこ（どれす）",
    "name": "カヨコ（ドレス）"
  },
  {
    "reading": "かりん",
    "name": "カリン"
  },
  {
    "reading": "かりん（ばにー）",
    "name": "カリン（バニー）"
  },
  {
    "reading": "かんな",
    "name": "カンナ"
  },
  {
    "reading": "かんな（みずぎ）",
    "name": "カンナ（水着）"
  },
  {
    "reading": "ききょう",
    "name": "キキョウ"
  },
  {
    "reading": "ききょう（みずぎ）",
    "name": "キキョウ（水着）"
  },
  {
    "reading": "きさき",
    "name": "キサキ"
  },
  {
    "reading": "きさき（みずぎ）",
    "name": "キサキ（水着）"
  },
  {
    "reading": "きらら",
    "name": "キララ"
  },
  {
    "reading": "くるみ",
    "name": "クルミ"
  },
  {
    "reading": "けい",
    "name": "ケイ"
  },
  {
    "reading": "ここな",
    "name": "ココナ"
  },
  {
    "reading": "こころ",
    "name": "ココロ"
  },
  {
    "reading": "こたま（きゃんぷ）",
    "name": "コタマ（キャンプ）"
  },
  {
    "reading": "ことね",
    "name": "コトネ"
  },
  {
    "reading": "ことり（おうえんだん）",
    "name": "コトリ（応援団）"
  },
  {
    "reading": "このか",
    "name": "コノカ"
  },
  {
    "reading": "こはる",
    "name": "コハル"
  },
  {
    "reading": "こゆき",
    "name": "コユキ"
  },
  {
    "reading": "こゆき（ぱじゃま）",
    "name": "コユキ（パジャマ）"
  },
  {
    "reading": "さおり",
    "name": "サオリ"
  },
  {
    "reading": "さおり（みずぎ）",
    "name": "サオリ（水着）"
  },
  {
    "reading": "さおり（どれす）",
    "name": "サオリ（ドレス）"
  },
  {
    "reading": "さき",
    "name": "サキ"
  },
  {
    "reading": "さき（みずぎ）",
    "name": "サキ（水着）"
  },
  {
    "reading": "さくらこ",
    "name": "サクラコ"
  },
  {
    "reading": "さくらこ（あいどる）",
    "name": "サクラコ（アイドル）"
  },
  {
    "reading": "さつき",
    "name": "サツキ"
  },
  {
    "reading": "さつき（みずぎ）",
    "name": "サツキ（水着）"
  },
  {
    "reading": "さや",
    "name": "サヤ"
  },
  {
    "reading": "さや（しふく）",
    "name": "サヤ（私服）"
  },
  {
    "reading": "しぐれ",
    "name": "シグレ"
  },
  {
    "reading": "しぐれ（おんせん）",
    "name": "シグレ（温泉）"
  },
  {
    "reading": "じゅり（あるばいと）",
    "name": "ジュリ（アルバイト）"
  },
  {
    "reading": "しゅん",
    "name": "シュン"
  },
  {
    "reading": "しゅん（ようじょ）",
    "name": "シュン（幼女）"
  },
  {
    "reading": "しゅん（みずぎ）",
    "name": "シュン（水着）"
  },
  {
    "reading": "しろこ",
    "name": "シロコ"
  },
  {
    "reading": "しろこ（みずぎ）",
    "name": "シロコ（水着）"
  },
  {
    "reading": "しろこ（らいでぃんぐ）",
    "name": "シロコ（ライディング）"
  },
  {
    "reading": "しろこてらー",
    "name": "シロコテラー"
  },
  {
    "reading": "すずみ（まじかる）",
    "name": "スズミ（マジカル）"
  },
  {
    "reading": "すみれ",
    "name": "スミレ"
  },
  {
    "reading": "すばる",
    "name": "スバル"
  },
  {
    "reading": "すみれ（あるばいと）",
    "name": "スミレ（アルバイト）"
  },
  {
    "reading": "せいあ",
    "name": "セイア"
  },
  {
    "reading": "せいあ（みずぎ）",
    "name": "セイア（水着）"
  },
  {
    "reading": "せな",
    "name": "セナ"
  },
  {
    "reading": "せな（しふく）",
    "name": "セナ（私服）"
  },
  {
    "reading": "せりか（しょうがつ）",
    "name": "セリカ（正月）"
  },
  {
    "reading": "せりか（みずぎ）",
    "name": "セリカ（水着）"
  },
  {
    "reading": "せりな（くりすます）",
    "name": "セリナ（クリスマス）"
  },
  {
    "reading": "たかね",
    "name": "タカネ"
  },
  {
    "reading": "ちあき",
    "name": "チアキ"
  },
  {
    "reading": "ちぇりの",
    "name": "チェリノ"
  },
  {
    "reading": "ちぇりの（おんせん）",
    "name": "チェリノ（温泉）"
  },
  {
    "reading": "ちせ（みずぎ）",
    "name": "チセ（水着）"
  },
  {
    "reading": "ちなつ（おんせん）",
    "name": "チナツ（温泉）"
  },
  {
    "reading": "ちひろ",
    "name": "チヒロ"
  },
  {
    "reading": "つばき（がいど）",
    "name": "ツバキ（ガイド）"
  },
  {
    "reading": "つるぎ",
    "name": "ツルギ"
  },
  {
    "reading": "つくよ",
    "name": "ツクヨ"
  },
  {
    "reading": "つくよ（どれす）",
    "name": "ツクヨ（ドレス）"
  },
  {
    "reading": "とき",
    "name": "トキ"
  },
  {
    "reading": "とき（ばにー）",
    "name": "トキ（バニー）"
  },
  {
    "reading": "ともえ（ちーぱお）",
    "name": "トモエ（チーパオ）"
  },
  {
    "reading": "なぎさ",
    "name": "ナギサ"
  },
  {
    "reading": "なぎさ（みずぎ）",
    "name": "ナギサ（水着）"
  },
  {
    "reading": "なぐさ",
    "name": "ナグサ"
  },
  {
    "reading": "なぐさ（みずぎ）",
    "name": "ナグサ（水着）"
  },
  {
    "reading": "なつ",
    "name": "ナツ"
  },
  {
    "reading": "なつ（ばんど）",
    "name": "ナツ（バンド）"
  },
  {
    "reading": "にこ",
    "name": "ニコ"
  },
  {
    "reading": "にや",
    "name": "ニヤ"
  },
  {
    "reading": "ねる",
    "name": "ネル"
  },
  {
    "reading": "ねる（ばにー）",
    "name": "ネル（バニー）"
  },
  {
    "reading": "ねる（せいふく）",
    "name": "ネル（制服）"
  },
  {
    "reading": "のあ",
    "name": "ノア"
  },
  {
    "reading": "のあ（ぱじゃま）",
    "name": "ノア（パジャマ）"
  },
  {
    "reading": "のぞみ",
    "name": "ノゾミ"
  },
  {
    "reading": "のどか（おんせん）",
    "name": "ノドカ（温泉）"
  },
  {
    "reading": "ののみ（みずぎ）",
    "name": "ノノミ（水着）"
  },
  {
    "reading": "はすみ（みずぎ）",
    "name": "ハスミ（水着）"
  },
  {
    "reading": "はなえ（くりすます）",
    "name": "ハナエ（クリスマス）"
  },
  {
    "reading": "はなこ（みずぎ）",
    "name": "ハナコ（水着）"
  },
  {
    "reading": "はるか（どれす）",
    "name": "ハルカ（ドレス）"
  },
  {
    "reading": "はるか（しょうがつ）",
    "name": "ハルカ（正月）"
  },
  {
    "reading": "はるな",
    "name": "ハルナ"
  },
  {
    "reading": "はるな（しょうがつ）",
    "name": "ハルナ（正月）"
  },
  {
    "reading": "はるな（たいそうふく）",
    "name": "ハルナ（体操服）"
  },
  {
    "reading": "はれ（きゃんぷ）",
    "name": "ハレ（キャンプ）"
  },
  {
    "reading": "ひかり",
    "name": "ヒカリ"
  },
  {
    "reading": "ひな",
    "name": "ヒナ"
  },
  {
    "reading": "ひな（みずぎ）",
    "name": "ヒナ（水着）"
  },
  {
    "reading": "ひな（どれす）",
    "name": "ヒナ（ドレス）"
  },
  {
    "reading": "ひびき",
    "name": "ヒビキ"
  },
  {
    "reading": "ひなた",
    "name": "ヒナタ"
  },
  {
    "reading": "ひなた（みずぎ）",
    "name": "ヒナタ（水着）"
  },
  {
    "reading": "ひふみ",
    "name": "ヒフミ"
  },
  {
    "reading": "ひふみ（みずぎ）",
    "name": "ヒフミ（水着）"
  },
  {
    "reading": "ひまり",
    "name": "ヒマリ"
  },
  {
    "reading": "ひまり（りんせん）",
    "name": "ヒマリ（臨戦）"
  },
  {
    "reading": "ひより",
    "name": "ヒヨリ"
  },
  {
    "reading": "ひより（みずぎ）",
    "name": "ヒヨリ（水着）"
  },
  {
    "reading": "ふぃーな（がいど）",
    "name": "フィーナ（ガイド）"
  },
  {
    "reading": "ふうか（しょうがつ）",
    "name": "フウカ（正月）"
  },
  {
    "reading": "ふぶき（みずぎ）",
    "name": "フブキ（水着）"
  },
  {
    "reading": "ふゆ",
    "name": "フユ"
  },
  {
    "reading": "ほしの",
    "name": "ホシノ"
  },
  {
    "reading": "ほしの（みずぎ）",
    "name": "ホシノ（水着）"
  },
  {
    "reading": "ほしの（りんせん）",
    "name": "ホシノ（臨戦）"
  },
  {
    "reading": "まき",
    "name": "マキ"
  },
  {
    "reading": "まき（きゃんぷ）",
    "name": "マキ（キャンプ）"
  },
  {
    "reading": "まこと",
    "name": "マコト"
  },
  {
    "reading": "まこと（みずぎ）",
    "name": "マコト（水着）"
  },
  {
    "reading": "ましろ",
    "name": "マシロ"
  },
  {
    "reading": "ましろ（みずぎ）",
    "name": "マシロ（水着）"
  },
  {
    "reading": "まりな",
    "name": "マリナ"
  },
  {
    "reading": "まりな（ちーぱお）",
    "name": "マリナ（チーパオ）"
  },
  {
    "reading": "まりー（たいそうふく）",
    "name": "マリー（体操服）"
  },
  {
    "reading": "まりー（あいどる）",
    "name": "マリー（アイドル）"
  },
  {
    "reading": "みか",
    "name": "ミカ"
  },
  {
    "reading": "みか（みずぎ）",
    "name": "ミカ（水着）"
  },
  {
    "reading": "みさき",
    "name": "ミサキ"
  },
  {
    "reading": "みさき（みずぎ）",
    "name": "ミサキ（水着）"
  },
  {
    "reading": "みちる（どれす）",
    "name": "ミチル（ドレス）"
  },
  {
    "reading": "みどり",
    "name": "ミドリ"
  },
  {
    "reading": "みどり（めいど）",
    "name": "ミドリ（メイド）"
  },
  {
    "reading": "みな",
    "name": "ミナ"
  },
  {
    "reading": "みね",
    "name": "ミネ"
  },
  {
    "reading": "みのり",
    "name": "ミノリ"
  },
  {
    "reading": "みもり",
    "name": "ミモリ"
  },
  {
    "reading": "みもり（みずぎ）",
    "name": "ミモリ（水着）"
  },
  {
    "reading": "みやこ",
    "name": "ミヤコ"
  },
  {
    "reading": "みやこ（みずぎ）",
    "name": "ミヤコ（水着）"
  },
  {
    "reading": "みゆ",
    "name": "ミユ"
  },
  {
    "reading": "みよ",
    "name": "ミヨ"
  },
  {
    "reading": "むつき（どれす）",
    "name": "ムツキ（ドレス）"
  },
  {
    "reading": "むつき（しょうがつ）",
    "name": "ムツキ（正月）"
  },
  {
    "reading": "めぐ",
    "name": "メグ"
  },
  {
    "reading": "める",
    "name": "メル"
  },
  {
    "reading": "もえ",
    "name": "モエ"
  },
  {
    "reading": "もえ（みずぎ）",
    "name": "モエ（水着）"
  },
  {
    "reading": "ももい（めいど）",
    "name": "モモイ（メイド）"
  },
  {
    "reading": "やくも",
    "name": "ヤクモ"
  },
  {
    "reading": "ゆうか（たいそうふく）",
    "name": "ユウカ（体操服）"
  },
  {
    "reading": "ゆうか（ぱじゃま）",
    "name": "ユウカ（パジャマ）"
  },
  {
    "reading": "ゆかり",
    "name": "ユカリ"
  },
  {
    "reading": "ゆかり（みずぎ）",
    "name": "ユカリ（水着）"
  },
  {
    "reading": "ゆず",
    "name": "ユズ"
  },
  {
    "reading": "ゆず（りんせん）",
    "name": "ユズ（臨戦）"
  },
  {
    "reading": "よしみ（ばんど）",
    "name": "ヨシミ（バンド）"
  },
  {
    "reading": "りお",
    "name": "リオ"
  },
  {
    "reading": "りお（りんせん）",
    "name": "リオ（臨戦）"
  },
  {
    "reading": "りつ",
    "name": "リツ"
  },
  {
    "reading": "るみ",
    "name": "ルミ"
  },
  {
    "reading": "れい",
    "name": "レイ"
  },
  {
    "reading": "れいさ",
    "name": "レイサ"
  },
  {
    "reading": "れいさ（まじかる）",
    "name": "レイサ（マジカル）"
  },
  {
    "reading": "れいじょ",
    "name": "レイジョ"
  },
  {
    "reading": "れな",
    "name": "レナ"
  },
  {
    "reading": "れんげ",
    "name": "レンゲ"
  },
  {
    "reading": "わかも",
    "name": "ワカモ"
  },
  {
    "reading": "わかも（みずぎ）",
    "name": "ワカモ（水着）"
  },
  {
    "reading": "はつねみく",
    "name": "初音ミク"
  },
  {
    "reading": "みさかみこと",
    "name": "御坂美琴"
  },
  {
    "reading": "しょくほうみさき",
    "name": "食蜂操祈"
  },
  {
    "reading": "あいり",
    "name": "アイリ"
  },
  {
    "reading": "あかね",
    "name": "アカネ"
  },
  {
    "reading": "あかり",
    "name": "アカリ"
  },
  {
    "reading": "あやね",
    "name": "アヤネ"
  },
  {
    "reading": "うたは",
    "name": "ウタハ"
  },
  {
    "reading": "かよこ",
    "name": "カヨコ"
  },
  {
    "reading": "きりの",
    "name": "キリノ"
  },
  {
    "reading": "しずこ",
    "name": "シズコ"
  },
  {
    "reading": "じゅんこ",
    "name": "ジュンコ"
  },
  {
    "reading": "せりか",
    "name": "セリカ"
  },
  {
    "reading": "ちせ",
    "name": "チセ"
  },
  {
    "reading": "つばき",
    "name": "ツバキ"
  },
  {
    "reading": "ののみ",
    "name": "ノノミ"
  },
  {
    "reading": "はすみ",
    "name": "ハスミ"
  },
  {
    "reading": "はなえ",
    "name": "ハナエ"
  },
  {
    "reading": "はなこ",
    "name": "ハナコ"
  },
  {
    "reading": "はれ",
    "name": "ハレ"
  },
  {
    "reading": "ふうか",
    "name": "フウカ"
  },
  {
    "reading": "まりー",
    "name": "マリー"
  },
  {
    "reading": "むつき",
    "name": "ムツキ"
  },
  {
    "reading": "もみじ",
    "name": "モミジ"
  },
  {
    "reading": "ももい",
    "name": "モモイ"
  },
  {
    "reading": "ゆうか",
    "name": "ユウカ"
  },
  {
    "reading": "れんげ（みずぎ）",
    "name": "レンゲ（水着）"
  },
  {
    "reading": "あいり（ばんど）",
    "name": "アイリ（バンド）"
  },
  {
    "reading": "あおば",
    "name": "アオバ"
  },
  {
    "reading": "あすな",
    "name": "アスナ"
  },
  {
    "reading": "あやね（みずぎ）",
    "name": "アヤネ（水着）"
  },
  {
    "reading": "いずみ（みずぎ）",
    "name": "イズミ（水着）"
  },
  {
    "reading": "いちか（みずぎ）",
    "name": "イチカ（水着）"
  },
  {
    "reading": "いぶき",
    "name": "イブキ"
  },
  {
    "reading": "おとぎ",
    "name": "オトギ"
  },
  {
    "reading": "かりん（せいふく）",
    "name": "カリン（制服）"
  },
  {
    "reading": "きりの（みずぎ）",
    "name": "キリノ（水着）"
  },
  {
    "reading": "こたま",
    "name": "コタマ"
  },
  {
    "reading": "ことり",
    "name": "コトリ"
  },
  {
    "reading": "こはる（みずぎ）",
    "name": "コハル（水着）"
  },
  {
    "reading": "しずこ（みずぎ）",
    "name": "シズコ（水着）"
  },
  {
    "reading": "しみこ",
    "name": "シミコ"
  },
  {
    "reading": "じゅり",
    "name": "ジュリ"
  },
  {
    "reading": "じゅんこ（しょうがつ）",
    "name": "ジュンコ（正月）"
  },
  {
    "reading": "すずみ",
    "name": "スズミ"
  },
  {
    "reading": "せりな",
    "name": "セリナ"
  },
  {
    "reading": "ちあき（みずぎ）",
    "name": "チアキ（水着）"
  },
  {
    "reading": "ちなつ",
    "name": "チナツ"
  },
  {
    "reading": "つるぎ（みずぎ）",
    "name": "ツルギ（水着）"
  },
  {
    "reading": "とき（りんせん）",
    "name": "トキ（臨戦）"
  },
  {
    "reading": "ともえ",
    "name": "トモエ"
  },
  {
    "reading": "のどか",
    "name": "ノドカ"
  },
  {
    "reading": "はすみ（たいそうふく）",
    "name": "ハスミ（体操服）"
  },
  {
    "reading": "はるか",
    "name": "ハルカ"
  },
  {
    "reading": "ひびき（おうえんだん）",
    "name": "ヒビキ（応援団）"
  },
  {
    "reading": "ふぃーな",
    "name": "フィーナ"
  },
  {
    "reading": "ふぶき",
    "name": "フブキ"
  },
  {
    "reading": "みちる",
    "name": "ミチル"
  },
  {
    "reading": "みね（あいどる）",
    "name": "ミネ（アイドル）"
  },
  {
    "reading": "みゆ（みずぎ）",
    "name": "ミユ（水着）"
  },
  {
    "reading": "ゆず（めいど）",
    "name": "ユズ（メイド）"
  },
  {
    "reading": "よしみ",
    "name": "ヨシミ"
  },
  {
    "reading": "らぶ",
    "name": "ラブ"
  },
  {
    "reading": "さてんるいこ",
    "name": "佐天涙子"
  }
];
