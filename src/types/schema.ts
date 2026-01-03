export type Confidence = 'observed' | 'inferred' | 'uncertain';

export interface Finding<T> {
  value: T;
  confidence: Confidence;
  evidence?: string[];
}

export interface Manifest {
  name: string;
  language: Finding<string>;
  framework?: Finding<string>;
  description?: string;
  generated_at: string;
  ctx_version: string;
}

export interface NamingConventions {
  files?: Finding<string>;
  functions?: Finding<string>;
  classes?: Finding<string>;
}

export interface FormattingConventions {
  indent?: Finding<string>;
  quotes?: Finding<string>;
  semicolons?: Finding<boolean>;
}

export interface ImportConventions {
  style?: Finding<string>;
  order?: Finding<string[]>;
}

export interface Conventions {
  naming?: NamingConventions;
  formatting?: FormattingConventions;
  imports?: ImportConventions;
  comments?: {
    jsdoc?: Finding<string>;
    inline?: Finding<string>;
  };
}

export type StructurePattern = 'vertical-features' | 'layered' | 'modular' | 'flat';

export interface Boundary {
  name: string;
  path: string;
  responsibility: string;
  confidence: Confidence;
}

export interface Architecture {
  structure?: Finding<StructurePattern>;
  boundaries?: Boundary[];
  patterns?: {
    persistence?: Finding<string>;
    error_handling?: Finding<string>;
    dependency_injection?: Finding<string>;
  };
  data_flow?: Finding<string>;
}

export interface Exclusions {
  paths: string[];
  ignore_patterns?: string[];
}

export interface FileEntry {
  path: string;
  relativePath: string;
  extension: string;
  isDirectory: boolean;
}

export interface FullContext {
  manifest: Manifest;
  conventions: Conventions;
  architecture: Architecture;
  exclusions: Exclusions;
}
