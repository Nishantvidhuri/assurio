/**
 * RDS Base UI Components
 *
 * All components in this directory are built from the Recrivio Design System
 * (RDS) Figma file. They use the RDS tokens defined in globals.css @theme
 * and CVA for variant management.
 *
 * For complex components (Calendar, DataTable, Dialog, etc.), install from
 * shadcn/ui registry: `npx shadcn@latest add <component>`
 */

export { Sheen } from './sheen';
export {
  Shadow,
  shadowVariants,
  getShadowClassName,
  type ShadowProps,
  type ShadowLevel,
} from './shadow';
export { Tooltip, type TooltipProps } from './tooltip';
export { HoverTooltipAnchor } from './hover-tooltip-anchor';
export { Badge, badgeVariants, type BadgeProps } from './badge';
export {
  Callout,
  type CalloutProps,
  type CalloutState,
  type CalloutConfiguration,
} from './callout';
export { Tag, tagVariants, type TagProps } from './tag';
export {
  Breadcrumbs,
  BreadcrumbItem,
  type BreadcrumbsProps,
  type BreadcrumbItemProps,
} from './breadcrumbs';
export { Button, buttonVariants, type ButtonProps } from './button';
export {
  ButtonContainer,
  buttonContainerVariants,
  type ButtonContainerProps,
} from './button-container';
export { Checkbox, type CheckboxProps } from './checkbox';
export { RadioButton, type RadioButtonProps } from './radio-button';
export { Divider, type DividerProps } from './divider';
export { ProgressBar, type ProgressBarProps } from './progress-bar';
export { Switch, type SwitchProps } from './switch';
export { TabBar, TabBarItem, type TabBarProps, type TabBarItemProps } from './tab-bar';
export { Toaster, toast } from './toast';
export {
  Snackbar,
  snackbar,
  type SnackbarProps,
  type SnackbarShowOptions,
  type SnackbarTheme,
  type SnackbarConfiguration,
} from './snackbar';
export {
  Stepper,
  StepNode,
  StepText,
  StepConnector,
  type StepperProps,
  type StepperItem,
  type StepperStatus,
  type StepperOrientation,
  type StepperTextState,
  type StepperConnectorTone,
  type StepNodeProps,
  type StepTextProps,
  type StepConnectorProps,
} from './stepper';
export {
  FilterChip,
  FilterRow,
  DateFilterChip,
  type FilterOption,
  type FilterChipProps,
  type FilterRowItem,
  type FilterRowProps,
  type DateFilterChipProps,
  type DateRangeValue as FilterDateRangeValue,
} from './filter';

export {
  InputFieldWrapper,
  Input,
  Textarea,
  inputBoxVariants,
  type InputFieldWrapperProps,
  type InputProps,
  type TextareaProps,
} from './input-field';
export { PhoneInput, validatePhoneNumber, type PhoneInputProps } from './phone-input';
export { DateInput, type DateInputProps } from './date-input';
export {
  DateRangeInput,
  type DateRangeInputProps,
  type DateRangeValue,
} from './date-range-input';
export { FileUploader, type FileUploaderProps } from './file-uploader';
export {
  MessageComposer,
  type MessageComposerProps,
} from './message-composer';
export {
  FilePreviewDialog,
  type FilePreviewDialogProps,
} from './file-preview-dialog';
export { AudioPlayer, type AudioPlayerProps } from './audio-player';
export {
  SelectInput,
  type SelectInputProps,
  type SelectOption,
} from './select-input';
export { Calendar } from './calendar';
export {
  Sidebar,
  SidebarItem,
  useSidebarContext,
  type SidebarProps,
  type SidebarItemProps,
} from './sidebar';
export { SvgIcon, type SvgIconProps } from './svg-icon';
export {
  TopBar,
  type TopBarProps,
  type ProfileMenuItem,
} from './topbar';
export { SearchBar, type SearchBarProps, type SearchSuggestion } from './search-bar';
export { TextType } from './text-type';
export { NumberCounter, type NumberCounterProps } from './number-counter';
export { Loader, type LoaderProps } from './loader';
export { Pagination, type PaginationProps } from './pagination';
export {
  PackageCard,
  type PackageCardProps,
  type PackageCardIncludedItem,
} from './package-card';
export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  statusChipVariants,
  type TableProps,
  type TableRowProps,
  type TableHeaderCellProps,
  type TableCellProps,
  type StatusVariant,
} from './table';
export {
  ComparisonTable,
  type ComparisonTableProps,
  type ComparisonTableRow,
} from './comparison-table';
export { DialogBox, type DialogBoxProps } from './dialog-box';
export { LiveDuration, type LiveDurationProps } from './live-duration';
export { Menu, type MenuProps, type MenuOption } from './menu';
export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from './popover';
export { ScrollArea, ScrollBar } from './scroll-area';
export {
  MenuItem,
  MenuItemLeadingElement,
  MenuItemTrailingElement,
  type MenuItemProps,
  type MenuItemState,
  type MenuItemType,
  type MenuItemLeadingElementType,
  type MenuItemTrailingElementType,
  type MenuItemLeadingElementProps,
  type MenuItemTrailingElementProps,
} from './menu-item';
