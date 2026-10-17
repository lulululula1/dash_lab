export type DataErrorCode =
  | 'unsupported-format'
  | 'legacy-xls'
  | 'file-too-large'
  | 'empty-file'
  | 'corrupted'
  | 'no-sheets'
  | 'no-header'
  | 'no-data-rows'
  | 'encoding'
  | 'lock-file'

/**
 * 사용자에게 보여 줄 수 있는 데이터 오류.
 * 메시지에 셀 내용 등 업로드 데이터를 포함하지 않는다.
 */
export class DataError extends Error {
  readonly code: DataErrorCode
  readonly hint?: string

  constructor(code: DataErrorCode, message: string, hint?: string) {
    super(message)
    this.name = 'DataError'
    this.code = code
    this.hint = hint
  }
}

/** 알 수 없는 오류를 민감 정보 없이 사용자용 오류로 변환한다. */
export function toUserError(err: unknown): DataError {
  if (err instanceof DataError) return err
  return new DataError(
    'corrupted',
    '파일을 분석하는 중 예기치 않은 오류가 발생했습니다.',
    '파일이 손상되지 않았는지 확인하거나 다른 형식(CSV/XLSX)으로 다시 저장해 보세요.',
  )
}
