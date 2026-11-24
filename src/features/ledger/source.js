// 帳目來源（transactions.source）的判斷
// 快照帳目：從群組同步來、尚未匯入帳戶的帳目。它不影響任何帳戶餘額，匯入後（detached）才變成一般帳目
export const isSnapshotTx = (tx) => tx?.source?.type === 'group' && tx.source.detached !== true
