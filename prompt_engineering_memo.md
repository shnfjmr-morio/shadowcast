# ShadowCast プロンプトエンジニアリング メモ

> 初版: 2026-03-23（ShadowCastでの実験から抽出）
> 改訂v1: 2026-03-25（外部リサーチ統合・GPT vs Gemini 比較追加）
> 改訂v2: 2026-03-25（**最新モデル対応**: Gemini 3.1 / GPT-5.4 の実測データ・公式ガイド反映）

---

## 目次

1. [LLM共通のベストプラクティス](#1-llm共通のベストプラクティス)
2. [GPT vs Gemini の差異](#2-gpt-vs-gemini-の差異)
3. [指示の配置位置の効果（Lost in the Middle）](#3-指示の配置位置の効果lost-in-the-middle)
4. [コンテキスト長と性能劣化](#4-コンテキスト長と性能劣化)
5. [過剰仕様（Over-Specification）の落とし穴](#5-過剰仕様over-specificationの落とし穴)
6. [音声AI・会話型AIのプロンプト設計](#6-音声ai会話型aiのプロンプト設計)
7. [ShadowCast実験から抽出した原則](#7-shadowcast実験から抽出した原則)
8. [設計原則まとめ](#8-設計原則まとめ)
9. [現在の安定プロンプト構造](#9-現在の安定プロンプト構造)

---

## 1. LLM共通のベストプラクティス

### 明確さと直接性
- **明示的に書く**: 暗黙の推論に頼らない。動詞を明確に（Write / Analyze / Generate）。
- **背景と理由を添える**: ルールの列挙だけでなく、なぜその制約があるかを説明するとモデルの追従精度が上がる。
- **ネガティブ指示より肯定指示**: 「〜するな」より「〜せよ」の方が確実に効く。ただし、プロンプトの **直後の行動を抑制する場合** はネガティブ指示が有効（後述）。

### Few-Shotと例示
- Gemini公式: "few-shot なしのプロンプトは精度が落ちる" と明言。
- 1つの例から始め、不安定な場合のみ増やす。**例はすべて同じフォーマットで統一**する。
- **サンプルフレーズの副作用**: 具体的な文言を例として書くと、モデルがそれを逐語的に繰り返す。バリエーション指示を必ず添える。

### 段階的推論（Chain of Thought）
- 「ステップバイステップで考えてください」を加えるだけで複雑タスクの精度が大幅向上。
- ただし CoT は長文プロンプト下での推論劣化を完全には防げない。

### 推奨プロンプト構造（OpenAI GPT-4.1ガイド）
```
1. Role & Objective（役割と目的）
2. Instructions（サブカテゴリ別に整理）
3. Reasoning Steps（推論手順）
4. Output Format（出力フォーマット）
5. Examples（例示）
6. Context（背景情報）
```

**Sources:** [Anthropic Prompt Best Practices](https://claude.com/blog/best-practices-for-prompt-engineering) / [OpenAI Prompt Engineering](https://platform.openai.com/docs/guides/prompt-engineering) / [Google Gemini Prompting Strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)

---

## 2. GPT-5.4 vs Gemini 3.1 の差異（2026年最新）

> **モデルリリース情報**
> - GPT-5.4: 2026年3月5日リリース（コンテキスト: 1Mトークン）
> - Gemini 3.1 Pro: 2026年2月19日リリース（コンテキスト: 1Mトークン / Deep Thinkは2M）

### 指示の配置優先順位（最新版）

| 観点 | GPT-5.4 | Gemini 3.1 |
|------|---------|------------|
| **通常の指示配置** | 分析指示は **データブロックの前** に置く（フロントロード） | システム制約は **冒頭**、データ後に **指示を末尾** で置く |
| **長文コンテキスト下** | 分析指示 → ドキュメント → 結果形式の順が推奨 | ドキュメント全体を先に与え、「上記を踏まえて〜」で質問を最後に |
| **フォーマット相性** | RACE フレーム（Role / Action / Context / Expectation）+ Markdown | XML タグ または Markdown。**混在は厳禁** |
| **指示への追従精度** | **IFEval: 96**（業界最高水準） | **IFEval: 89** |
| **デフォルト応答量** | 制約なしでも比較的コンパクト | 制約しないと長文になりがち。簡潔さを明示的に指示する |

> ⚠️ **Gemini 3.1 の重要な変更点**（Gemini 2.x からの逆転）
> Gemini 2.x では「冒頭に全ての指示を置く」が推奨だったが、
> **Gemini 3.1 では大きなコンテキストがある場合、具体的な指示はデータの後（末尾）に置く方が効果的**。
> システムレベルの制約（役割・行動ルール）は引き続き冒頭に置く。

> ⚠️ **GPT-5.4 の重要な変更点**（GPT-4.1 からの変化）
> GPT-4.1 では「後に書いた指示が優先」だったが、
> **GPT-5.4 では分析指示をドキュメントの前（先頭）に置くことが公式に推奨**されている。
> 「何を探すか」を先に伝えてからドキュメントを処理させる設計。

### 用途別の向き不向き

| ユースケース | 推奨モデル | 理由 |
|------------|-----------|------|
| **精密な指示追従が必要なパイプライン** | GPT-5.4 | IFEval 96 vs 89 |
| **長大ドキュメント処理** | Gemini 3.1 (Deep Think) | 2Mトークン、動画・マルチモーダル対応 |
| **コード生成・ツール連携** | GPT-5.4 | 多段ツール呼び出しでの精度が高い |
| **エージェント型タスク（Web検索含む）** | Gemini 3.1 Pro | BrowseComp ベンチで優位 |
| **会話型・マルチフェーズセッション** | どちらも可。GPT-5.4 が指示追従で安定 | |

### Gemini 3.1 固有の注意点
- **Temperature は default 1.0 のまま使う**: Gemini 3.1 の推論はデフォルト最適化されており、調整しても改善しない
- **短いプロンプトが有効になった**: Gemini 2.x では長文プロンプトが必要だったが、3.1 では同じプロンプトが「冗長に感じる」結果になる場合がある
- **「〜するな」系の広範な制約を避ける**: "do not infer" などの開放的なネガティブ制約はモデルが過剰適応し、基本的な論理推論もしなくなる。代わりに「〜のみを使って推論せよ」と肯定形で書く
- **Thinking Level の活用**: 複雑な推論タスクは `thinking_level: "high"` を指定しつつプロンプト自体はシンプルにする（Chain-of-Thought の手動指示は不要になった）

### GPT-5.4 固有の注意点
- **Reasoning Effort の選択**: デフォルトは `none`〜`low` で十分。ワークフロー実行・構造化抽出などは `none` から始める
- **Output Contract の明示**: 「何文字以内」「どの形式で」「何を引用すべきか」を明示すると大幅に安定する
- **Zero-shot から始める**: Few-shot の効果が GPT-4.1 より低下している。まず zero-shot で試すこと
- **過剰な "bribe language" は無効**: CRITICAL / NEVER / DO NOT FAIL などの強調語はGPT-5.4では効果がなく、GPT-4.1時代の推奨は無効化された

### Lost in the Middle（最新状況）
- **GPT-5.3 以降**: 新しいアテンションメカニズムで「Lost in the Middle」を大幅改善。コンテキスト全体で一貫したパフォーマンスを維持
- **Gemini 3.1 Pro**: 以前のバージョンより大幅改善されたとの公式発表あり。ただしコミュニティでは「長い会話では依然として情報が失われる」との報告も
- **実用上の目安**: 劇的に改善したとはいえ、最重要指示を中央に埋めるリスクは変わらず存在する。先頭・末尾の配置原則は維持推奨

**Sources:** [GPT-5.4 vs Gemini 3.1 Pro Comparison – YingTu](https://yingtu.ai/en/blog/gpt-5-4-vs-gpt-5-3-vs-gemini-3-1) / [Gemini 3 Prompt Practices – philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices) / [GPT-5.4 Prompting Guide – aipromptsx.com](https://aipromptsx.com/blog/gpt-5-4-prompting-guide-2026) / [GPT-5.4 vs Gemini 3.1 Pro – MindStudio](https://www.mindstudio.ai/blog/gpt-5-4-vs-gemini-3-1-pro-agentic-workflows) / [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3)

---

## 3. 指示の配置位置の効果（Lost in the Middle）

### 実証された現象
- **Liu et al. (2023, MIT Press TACL)** による基礎研究で確立。
- **プロンプト中央に置かれた重要情報は、先頭・末尾より大幅に見落とされる。**
- 原因: Rotary Position Embedding（RoPE）に組み込まれた long-term decay 効果が、モデルを先頭・末尾トークンに注目させる。
- パフォーマンス低下は最大 **73%** に達するケースあり（拡張CoTタスクで）。

### 実践的な指針
- **最重要指示は先頭か末尾に置く。絶対に中央に埋めない。**
- OpenAI GPT-4.1 公式推奨: 「長いコンテキストがある場合、指示をその前後両方に置け。片方だけなら上が有効。」
- Gemini: 「コンテキスト全体を先に提供し、その後に質問を置く」が公式推奨。

### シャフルされたコンテキストの逆説（Chroma研究）
- 論理的に構造化されたコンテキストより、シャフル（無秩序）なコンテキストの方がパフォーマンスが良いケースがある。
- 仮説: アテンションメカニズムが自然なナラティブフローに引きずられると逆効果になる。

**Sources:** [Lost in the Middle – MIT Press TACL](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00638/119630/Lost-in-the-Middle-How-Language-Models-Use-Long) / [Promptmetheus LLM Knowledge Base](https://promptmetheus.com/resources/llm-knowledge-base/lost-in-the-middle-effect) / [Chroma Context Rot Research](https://www.trychroma.com/research/context-rot)

---

## 4. コンテキスト長と性能劣化

### 研究が示す劣化パターン
- **3,000トークン付近で推論性能の最初の崖** が確認されている（2024年研究）。モデルの理論的なコンテキストウィンドウをはるかに下回る数値。
- 「関係のない情報が少量あるだけでも予測が不安定になる」（MLOpsコミュニティ研究）。
- **セマンティックに近いが無関係な情報の方が、完全に無関係な情報よりダメージが大きい**（質問と文体が似ているが答えには不要な記述）。
- GPT-4.1: 約2,500単語以降から Refusal（拒否応答）が増加（約2.55%）。

### 対策
1. コンテキストを「有限の作業メモリ」として設計する（Anthropic推奨）。
2. 長期セッションでは **コンパクション**（会話履歴を要約して再注入）を行う。
3. Just-in-Time Retrieval: すべてのデータを事前ロードせず、必要な時点で取得する。
4. **目標長でのテストを必ず行う**（短文での性能を長文に外挿しない）。

> **ShadowCastへの含意**: 現プロンプトは前回評価・前回プロンプトを丸ごと埋め込む設計。これが3,000トークン超えを招く場合、Phase 3の重要指示（=== マーカー類）が「中央」に落ちてしまうリスクがある。要約版の前回評価を埋め込む設計も将来的に検討。

**Sources:** [Context Rot – Chroma 2025](https://www.trychroma.com/research/context-rot) / [Prompt Bloat – MLOps Community](https://mlops.community/the-impact-of-prompt-bloat-on-llm-output-quality/) / [Anthropic Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

---

## 5. 過剰仕様（Over-Specification）の落とし穴

### 指示が多すぎると何が起きるか
- **Lost in the Middle の悪化**: 指示が増えるほど中央部の指示が無視される確率が上がる。
- **矛盾の増加**: 指示が多いほど、モデルが矛盾を検出して混乱するリスクが増す。
- **ハルシネーション助長**: 「必ず〜せよ」という絶対的要求は、情報不足時に嘘の応答を生成させる。
- **サンプルフレーズの逆効果**: 具体的なフレーズ例を与えると、モデルがそれを逐語的に繰り返すようになる。
- **全大文字・強調語の過剰使用**: NEVER / CRITICAL / no exceptions を多用すると優先度が均質化し、本当に重要なものが埋もれる。OpenAI GPT-4.1ガイドでも明示的に否定されている。

### 「Goldilocks Zone」（Anthropicの概念）
- 「詳細すぎる固定ロジック」と「文脈を前提にした曖昧な指示」の間の適切なゾーンがある。
- システムプロンプトは「行動を導くほど具体的、かつ強いヒューリスティックを与えるほど柔軟」であるべき。

### 実践的な目安
- 単純タスクで指示が **150〜250トークン** を超える場合、隠れたあいまいさがある可能性を疑う。
- 指示はミニマムに保ち、ドキュメント・例・表は**分離したコンテキストブロック**に配置する。
- 新モデルへの移行時: シンプルなプロンプトから始め、失敗パターンをもとに段階的に追加する（Anthropic・OpenAI共通推奨）。

**Sources:** [GPT-4.1 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide) / [Anthropic Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) / [Prompt Bloat – MLOps Community](https://mlops.community/the-impact-of-prompt-bloat-on-llm-output-quality/)

---

## 6. 音声AI・会話型AIのプロンプト設計

### テキストプロンプトとの根本的な違い
- 音声AIはコンテンツを **同期・線形** に処理する（読み返しができない）。
- **Markdownは禁物**: TTSが記号をそのまま読み上げる。
- **レイテンシ制約**: 500ms〜1.5秒以上の前置きは「壊れているように聞こえる」。
- **ターン取得の明示**: エージェントが「待っている」サインを明示的に設計する必要がある。

### 推奨システムプロンプト構造（Voice AI向け）
```
1. Identity（2-3文）— 役割とペルソナ
2. Scope — できること・できないことの明示
3. Tone & Speaking Style — 具体的な話し方の指示
4. Key Information — 必要な知識・FAQ
5. Task & Workflow — 番号付き手順（条件分岐含む）
6. Edge Case Handling — 沈黙・聞き取れない場合・範囲外質問の対処
```

### ペルソナを「形容詞」でなく「行動」で定義する
- NG: 「フレンドリーに話して」
- OK: 「文頭を And/But/So で始めてよい。相手の発言を詳細に繰り返さず自然に参照する」
- 会話らしさは「不完全さの許可」によって生まれる（um、えー、…などを許可または奨励）。

### マルチフェーズセッション（ShadowCastが最も関係するポイント）
- **フェーズを明示的な番号付きステップ** で定義する。
- 各フェーズの **遷移条件を明示** する（「3文完了 → Free Talkへ」など単一トリガー）。
- `<wait for user response>` のようなマーカーで待機タイミングを示すことも有効。
- フェーズごとに専用エージェントを分担させる設計（Vapi Squads等）も選択肢。

### ターンごとの応答長
- **1ターン = 1〜3文、40単語以内** が推奨（詳細説明が明示的に求められた場合を除く）。
- レイテンシ削減の主な手段は「入力プロンプトの短縮」より **「出力の簡潔さを指示すること」**。

### よくある失敗パターン
| 失敗 | 対策 |
|------|------|
| エージェントが長文を話しすぎる | 「1ターン1〜2文」を明示的に指示 |
| 同じフレーズを繰り返す | Sample Phraseに「バリエーションを変えること」を付記 |
| フェーズが進まない | 遷移条件を具体的な行動（回数・発話）で定義 |
| 不自然に丁寧すぎる | "I'd be happy to assist" 等の表現を禁止し、代替を例示 |
| 数字・略語の読み上げ失敗 | スペルアウトを指示（例: "CEFR" → "C-E-F-R"） |

**Sources:** [Vapi Prompting Guide](https://docs.vapi.ai/prompting-guide) / [LiveKit Voice Agent Prompting](https://livekit.com/blog/prompting-voice-agents-to-sound-more-realistic/) / [MasterPrompting Voice AI](https://masterprompting.net/blog/voice-ai-prompting-vapi-elevenlabs)

---

## 7. ShadowCast実験から抽出した原則

> 2026-03-23 作成 / プロンプトが安定した版・壊れた版の比較分析から

### なぜ「良いプロンプト」は安定したのか

**1. 構造のシンプルさ**
各フェーズの指示が **2〜4行で完結** しており、AIが迷う余地がない。「何をするか」が1つの文に1つの行動として対応している。

**2. 禁止ルールの隣接配置**
「Do NOT add notes after the sentence」といった禁止命令が、**問題になるタイミングの直後**に書かれている。文脈から切り離した抽象的な禁止ではなく、「このアクションの直後にこれをするな」という配置。→ リサーチとも一致（文脈隣接の原則）。

**3. 基準は定性的に残す**
Strictモードの基準が「correct pronunciation, natural rhythm, and full completeness」と定性的。AIの判断に委ねることで、過剰な硬直を避け状況に応じた対応ができる。→「Goldilocks Zone」の実例。

**4. トリガーと応答の1対1**
「3文完了 → Free Talkへ」という **単一トリガー・単一応答**。AIが「今どの条件にいるか」を追跡しなくて済む。

**5. 終了処理の明確な切り替え**
「STOP speaking」「wait silently」という単純な終端命令で締める。例外条件を列挙せず、動作範囲を極限まで絞り込む。

**6. 最終行は無条件の起動命令**
「Now begin IMMEDIATELY. Do not wait for the student to speak first.」条件がなく、AIが迷う分岐が存在しない。

---

### なぜ「変更後のプロンプト」は壊れたのか

**Strictモードの過仕様化**
- 「word-by-word mentally compare」など、AIに内部状態の維持と逐次比較を要求した
- 「e.g., 'You said X but the sentence is Y'」という具体例を出したことで、AIがフォーマット自体を模倣し始めた
- 強調語（STRICT MODE is ON, Do NOT relax under any circumstances）を多用し、他の重要指示が埋もれた

**ブレイクダウンの条件分岐爆発**
「DIFFERENT spotの場合」「SAME spotの場合」という3分岐の連鎖は、AIにリアルタイムの状態機械として動作することを要求した。→「Lost in the Middle」効果が重なり、誤認・優先順位崩壊が起きた。

**センテンスカウントの外部化**
「Say 'Sentence X of N' before each new sentence」でカウンタを口頭で公表させた。カウントがずれると以降の指示の整合性がすべて崩れる。→ **状態はAI内部に留める**が正解。

**Phase 3 終了処理の多段化**
「1. まずこれを言え、2. すべての評価を出せ」という順序付き複数ステップに変更。「STOP speaking」という単純な終端命令が消えたことが最大の原因。

**最終行に条件を付けた**
「Once the student speaks to you」という条件が付き、主導権が学生側に移った。→ セッション開始のタイミングが不安定になった。

---

### 音声AI特有の注意点

| 注意点 | 説明 |
|--------|------|
| **状態を持たせない** | 音声AIはターン間の精密な状態追跡が苦手。前の発話のX番目の単語と比較する処理は壊れやすい |
| **口頭/非口頭の境界を一文で宣言** | 「この評価は読み上げるな」は禁止命令として書く。何を言わないかの明示が重要 |
| **停止命令は明示する** | AIは音声の沈黙を埋めようとする。「then stop completely」「STOP and wait」がないと余計なコメントが入る |
| **具体例の副作用に注意** | e.g. で書いた文字列パターンをテンプレートとして固定化する。意図よりフォーマットが優先されることがある |

---

## 8. 設計原則まとめ

### ✅ DO（共通）

- **最重要指示は先頭か末尾に配置する**（中央に埋めない — Lost in the Middle 対策。最新モデルでも有効）
- **1アクション = 1文** で書く。「〜して、〜して、〜する」は分割する
- **禁止ルールは発生タイミングの直後** に配置する（文脈隣接の原則）
- **終端条件は単一命令** で書く。「STOP」「wait silently」のような最小単位の命令で締める
- **起動命令は無条件** にする。セッション開始に条件分岐を持ち込まない
- **AIの判断余地を定性的に残す**。基準をすべて列挙・定量化すると硬直する
- **状態はAI内部に留める**。カウンタや進捗を口頭で公表させない
- **動いている指示は最小変更の原則を守る**
- **Output Contract を明示する**（GPT-5.4 で特に有効）: 形式・文字数・引用ルールを具体的に

### ✅ DO（GPT-5.4 向け）

- **分析指示はドキュメントブロックの前に置く**（フロントロード）
- **RACE フレームで構造化する**: Role → Action → Context → Expectation
- **Zero-shot から試す**（Few-shot の効果が GPT-4.1 より薄い）
- **Reasoning Effort は `none` か `low` から始める**（高精度タスク以外）

### ✅ DO（Gemini 3.1 向け）

- **システム制約・役割定義は冒頭に置く**
- **大きなコンテキストがある場合、具体的な指示はデータの後（末尾）に置く**（2.x から逆転）
- **「上記を踏まえて〜」のようなコンテキストアンカーを使う**
- **Temperature はデフォルト 1.0 のまま**
- **プロンプトは Gemini 2.x より短く書いてよい**（短くした方が良い場合がある）
- **複雑な推論は `thinking_level: "high"` + シンプルなプロンプトで対応**（CoT の手動指示は不要）

### ❌ DON'T（共通）

- **条件分岐を3つ以上連鎖させない**（if A → if not-A then B → if not-B then C...）
- **具体例のフォーマットを出さない**（AIがフォーマットを目的と誤認する）
- **強調語（NEVER, CRITICAL, no exceptions）を多用しない**。最新モデルではほぼ無効化されている
- **複数ステップの順序付き実行を音声フェーズに持ち込まない**
- **「改善」という名目で動いている指示を詳細化しない**
- **中央部に重要指示を配置しない**（改善されたとはいえリスクは残る）
- **前回評価や前回プロンプトを丸ごと埋め込みすぎない**（3,000トークン超えのリスク）
- **Gemini 3.1 に広範なネガティブ制約を使わない**（"do not infer" 等は過剰適応を招く）
- **GPT-5.4 に bribe language を使わない**（CRITICAL / DO NOT FAIL 等は効果なし）

---

## 9. 現在の安定プロンプト構造

> v2.9.0 / 2026-03-25 時点。詳細は `prompt_best_version.md` 参照。

```
① 冒頭：「了解しました」のみ返答ルール（テキスト受信時）← 最重要・冒頭に配置
② Session Settings（レベル・トピック・フォーカス・前回評価）
③ Phase 1: Shadowing Practice
   - 配送フォーマット（3ステップ、フルセンテンス試行優先）
   - 精度基準（strict/flexibleを4行で完結）
   - ブレイクダウン（a/b/c/d形式、シンプル）
   - 音声認識の注意
   - センテンスカウント（疑問文遷移）
④ Phase 2: Free Talk
   - トピック起点ルール
   - 介入頻度（interventionFrequency）
   - 修正ドリル（明確なトリガー + Phase 1と同じ構造）
⑤ Phase 3: Session End
   - 評価フォーマット（=== マーカー + CEFR JSON）
⑥ General Rules（汎用ルール）
⑦ Now begin IMMEDIATELY（無条件起動）← 最重要・末尾に配置
```

> **注目点**: 最重要指示（冒頭の返答ルールと末尾の起動命令）が先頭・末尾に置かれており、Lost in the Middle の影響を自然に回避している。

---

## 総括

> ShadowCastでの実験と外部リサーチが一致して示す本質：
>
> **AIに「判断」させる部分と「実行」させる部分を明確に分ける。**
> 判断（合否の判定）は定性的に委ね、実行（次に何を言うか）は単純な命令にする。
>
> **音声AIは「良い判断をする自律エージェント」ではなく「明確な命令に従うアクター」として設計する方が安定する。**
>
> **2026年最新の指示配置原則（GPT-5.4 vs Gemini 3.1）:**
> - GPT-5.4: **分析指示 → データ** の順（指示をフロントロード）
> - Gemini 3.1: **システム制約を冒頭、具体的指示はデータの後（末尾）**
> - 共通: **最重要指示は先頭か末尾。中央に埋めない。** 最新モデルで改善されたが原則は有効。
>
> **モデルの特性を踏まえたプロンプトの書き分けが実践的に有効になってきている。**

---

*参考文献一覧*

**2026年最新（Gemini 3.1 / GPT-5.4）**
- [GPT-5.4 vs Gemini 3.1 Pro – YingTu 比較ガイド](https://yingtu.ai/en/blog/gpt-5-4-vs-gpt-5-3-vs-gemini-3-1)
- [GPT-5.4 vs Gemini 3.1 Pro: Agentic Workflows – MindStudio](https://www.mindstudio.ai/blog/gpt-5-4-vs-gemini-3-1-pro-agentic-workflows)
- [Gemini 3 Prompt Practices – philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices)
- [Gemini 3 Developer Guide – Google AI](https://ai.google.dev/gemini-api/docs/gemini-3)
- [GPT-5.4 Prompting Guide – aipromptsx.com](https://aipromptsx.com/blog/gpt-5-4-prompting-guide-2026)
- [GPT-5.4 Is Changing the Rules of Prompt Engineering – Medium](https://medium.com/write-a-catalyst/gpt-5-4-is-changing-the-rules-of-prompt-engineering-b6f925e84ea6)
- [Gemini 3.1 Pro Release – DEV Community](https://dev.to/matthewhou/gemini-31-pro-just-dropped-heres-what-changed-and-why-it-matters-6ni)
- [GPT-5.2 Prompting Guide – OpenAI Cookbook](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide)

**2025年以前の基礎リサーチ**
- [Anthropic Prompt Engineering Best Practices](https://claude.com/blog/best-practices-for-prompt-engineering)
- [OpenAI Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)
- [GPT-4.1 Prompting Guide (OpenAI Cookbook)](https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide)
- [Google Gemini Prompting Strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)
- [Lost in the Middle – MIT Press / TACL (Liu et al.)](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00638/119630/Lost-in-the-Middle-How-Language-Models-Use-Long)
- [Context Rot Research – Chroma (2025)](https://www.trychroma.com/research/context-rot)
- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Prompt Bloat Impact on LLM Quality – MLOps Community](https://mlops.community/the-impact-of-prompt-bloat-on-llm-output-quality/)
- [Vapi Voice AI Prompting Guide](https://docs.vapi.ai/prompting-guide)
- [LiveKit: Prompting Voice Agents to Sound Realistic](https://livekit.com/blog/prompting-voice-agents-to-sound-more-realistic/)
- [Promptmetheus: Lost in the Middle Effect](https://promptmetheus.com/resources/llm-knowledge-base/lost-in-the-middle-effect)
