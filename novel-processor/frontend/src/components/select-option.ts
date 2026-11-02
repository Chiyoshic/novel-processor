/** 全局下拉选项；保留字符串或数值的原始类型。 */
export interface SelectOption<T extends string | number = string> {
  value: T
  label: string
  hint?: string
  disabled?: boolean
}
