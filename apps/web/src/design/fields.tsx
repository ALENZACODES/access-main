import { Checkbox, FieldError, Input, Label, Radio, RadioGroup, Text, TextField } from "react-aria-components";

export function TextInput({
  label,
  description,
  value,
  onChange,
  error,
  inputMode,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  inputMode?: "text" | "numeric";
}) {
  return (
    <TextField isInvalid={Boolean(error)} value={value} onChange={onChange} className="field">
      <Label>{label}</Label>
      {description ? <Text slot="description">{description}</Text> : null}
      <Input inputMode={inputMode ?? "text"} autoComplete="off" />
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}

export function ChoiceGroup({
  label,
  description,
  value,
  onChange,
  options,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <RadioGroup className="field" value={value} onChange={onChange}>
      <Label>{label}</Label>
      {description ? <Text slot="description">{description}</Text> : null}
      <div className="choice-grid">
        {options.map((option) => (
          <Radio key={option.value || "empty"} className="radio-option" value={option.value}>
            {option.label}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}

export function CheckField({
  label,
  description,
  isSelected,
  onChange,
  error,
}: {
  label: string;
  description?: string;
  isSelected: boolean;
  onChange: (value: boolean) => void;
  error?: string;
}) {
  return (
    <Checkbox className="check-option" isSelected={isSelected} onChange={onChange} isInvalid={Boolean(error)}>
      <span className="check-box" aria-hidden="true" />
      <span>
        <span className="check-label">{label}</span>
        {description ? <span className="field-help">{description}</span> : null}
        {error ? <span className="field-error">{error}</span> : null}
      </span>
    </Checkbox>
  );
}
