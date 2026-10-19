// Metro picks date-time.web.tsx or date-time.native.tsx; these are the types for both.
// Dates are "YYYY-MM-DD" and times "HH:MM", in UK time, like the website's inputs.
export declare function DateField(props: { value: string; onChange: (value: string) => void; testID?: string; accessibilityLabel?: string }): React.JSX.Element;
export declare function TimeField(props: { value: string; onChange: (value: string) => void; testID?: string; accessibilityLabel?: string }): React.JSX.Element;
