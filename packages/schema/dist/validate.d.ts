import { type ErrorObject } from "ajv/dist/2020.js";
export interface ValidationIssue {
    instancePath: string;
    message: string;
    schemaPath: string;
}
export interface ValidationResult {
    ok: boolean;
    schemaId: string;
    errors: ValidationIssue[];
}
export declare class SchemaValidator {
    private readonly ajv;
    private readonly byId;
    constructor(directory?: string);
    schemaIds(): string[];
    validate(schemaId: string, data: unknown): ValidationResult;
    /** Pick the schema from the record shape. Import records keep their access-maps schema ids. */
    validateDetected(data: unknown): ValidationResult;
}
export declare function detectSchemaId(data: unknown): string | null;
export declare function formatErrors(errors: ErrorObject[] | null | undefined): ValidationIssue[];
export declare function getValidator(): SchemaValidator;
