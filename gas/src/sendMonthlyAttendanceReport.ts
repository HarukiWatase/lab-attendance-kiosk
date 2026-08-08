/**
 * 月次の研究室在室時間レポートを自動送信
 * 集計期間外はメールを送信しない
 */
function sendMonthlyAttendanceReport() {
  // -----------------------------------------
  // 1. メール固有の設定項目
  // -----------------------------------------
  const MAIL_CONFIG = {
    TO_NAME: "00先生",
    TO_ADDRESS: "dummy_professor@example.com",
    CC_NAME: "研究室の皆様",
    CC_ADDRESS: "dummy_lab_members@example.com",
    SENDER_NAME: "担当者名",
    SENDER_EMAIL: "dummy_tantou@example.com"
  };

  // -----------------------------------------
  // 2. シートの取得とURL生成
  // -----------------------------------------
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PROFESSOR_SHEET_NAME);
  if (!sheet) {
    Logger.log("シート " + PROFESSOR_SHEET_NAME + " が見つかりません。");
    return;
  }

  // URLの末尾に #gid=シートID を付与し、直接対象シートを開くように設定
  const spreadsheetUrl = ss.getUrl() + "#gid=" + sheet.getSheetId();
  const data = sheet.getDataRange().getValues();

  // -----------------------------------------
  // 3. 基本情報（日付）の取得と【期間外判定】
  // -----------------------------------------
  // A2セルから集計基準日を抽出
  const baseDateMatch = String(data[1][0]).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!baseDateMatch) return;
  const reportYear = parseInt(baseDateMatch[1], 10);
  const reportMonth = parseInt(baseDateMatch[2], 10);
  const reportDay = parseInt(baseDateMatch[3], 10);

  const asOfDate = new Date(reportYear, reportMonth - 1, reportDay);
  const targetMonthStart = new Date(reportYear, reportMonth - 1, 1);

  // A3セルから学期期間を抽出
  const periodMatch = String(data[2][0]).match(/(\d{4})-(\d{2})-(\d{2}) 〜 (\d{4})-(\d{2})-(\d{2})/);
  if (!periodMatch) return;
  const termStart = new Date(parseInt(periodMatch[1], 10), parseInt(periodMatch[2], 10) - 1, parseInt(periodMatch[3], 10));
  const termEnd = new Date(parseInt(periodMatch[4], 10), parseInt(periodMatch[5], 10) - 1, parseInt(periodMatch[6], 10));

  // 判定：集計基準日が学期開始より前、または対象月が学期終了後の場合はメールを送らない
  if (asOfDate < termStart || targetMonthStart > termEnd) {
    Logger.log(`集計対象(${reportMonth}月度)が学期期間外のため、メール送信をスキップしました。`);
    return;
  }

  // 集計期間テキストの生成（例：4月の場合は 4/7〜4/30、5月の場合は 5/1〜5/31）
  const displayStart = (targetMonthStart < termStart) ? termStart : targetMonthStart;
  const periodText = `${displayStart.getMonth() + 1}/${displayStart.getDate()}〜${asOfDate.getMonth() + 1}/${asOfDate.getDate()}`;

  // -----------------------------------------
  // 4. A4セルから【目標数値】の動的取得
  // -----------------------------------------
  // A4セルから公式週数と目標週平均を抽出
  const a4Text = String(data[3][0]);
  const nMatch = a4Text.match(/N=(\d+(?:\.\d+)?)/);
  const hMatch = a4Text.match(/(\d+(?:\.\d+)?)h\/週/);

  const targetWeeks = nMatch ? parseFloat(nMatch[1]) : 15;     // 公式週数N
  const targetWeeklyH = hMatch ? parseFloat(hMatch[1]) : 15;   // 目標週平均
  const targetTotalH = targetWeeks * targetWeeklyH;            // 学期目標総時間

  // -----------------------------------------
  // 5. 学生データの抽出とカテゴライズ
  // -----------------------------------------
  let achieved = [];
  let unachieved = [];
  let passedWeeks = "0";

  for (let i = 12; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;

    const name = row[1];
    passedWeeks = row[4];
    const weeklyAvg = parseFloat(row[5]);
    const progressRate = parseFloat(row[8]);

    const studentText = `・${name}：週平均 ${weeklyAvg.toFixed(1)}h（学期進捗 ${progressRate.toFixed(1)}%）`;

    // A4から抽出した動的な目標数値（targetWeeklyH）を基準に振り分け
    if (weeklyAvg >= targetWeeklyH) {
      achieved.push(studentText);
    } else {
      unachieved.push(studentText);
    }
  }

  // -----------------------------------------
  // 6. メール文面の構築
  // -----------------------------------------
  const subject = `【研究室在室管理】${reportMonth}月度 研究室在室時間の集計結果について`;

  // ※インデントを入れるとメール本文にも空白が入るため、左詰めで記述
  const body = `${MAIL_CONFIG.TO_NAME}
cc.${MAIL_CONFIG.CC_NAME}

お疲れ様です。${MAIL_CONFIG.SENDER_NAME}です。
${reportMonth}月度（${periodText}：経過週数${passedWeeks}週）の研究室在室時間の集計が完了いたしましたので、概要をご報告いたします。
詳細なログやグラフにつきましては、以下のスプレッドシートよりご確認ください(先生のみアクセス可能)。 
${spreadsheetUrl}

■ ${reportMonth}月度 在室時間サマリー 
・目標基準：週${targetWeeklyH}時間（学期${targetWeeks}週 / 学期目標${targetTotalH}時間） 
※自動補正された入退室セッションは集計から除外しています。

${achieved.join('\n')}
~~~週目標ライン~~~
${unachieved.join('\n')}

ご確認のほど、よろしくお願いいたします。

研究室勤怠システムより送信
担当：${MAIL_CONFIG.SENDER_NAME}
${MAIL_CONFIG.SENDER_EMAIL}`;

  // -----------------------------------------
  // 7. メールの送信
  // -----------------------------------------
  GmailApp.sendEmail(MAIL_CONFIG.TO_ADDRESS, subject, body, {
    cc: MAIL_CONFIG.CC_ADDRESS,
    name: MAIL_CONFIG.SENDER_NAME
  });

  Logger.log(`${reportMonth}月度の集計メールを送信しました。`);
}