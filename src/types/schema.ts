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
  isMonorepo?: Finding<boolean>;
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
  builtinPrefix?: Finding<boolean>;
  /** @deprecated Use builtinPrefix instead */
  nodePrefix?: Finding<boolean>;
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

export interface DependencyInfo {
  name: string;
  version?: string;
  purpose: string;
  confidence: Confidence;
}

export interface DependencyCategories {
  stateManagement?: string[];
  routing?: string[];
  database?: string[];
  networking?: string[];
  codeGeneration?: string[];
  dependencyInjection?: string[];
  testing?: string[];
  firebase?: string[];
  utilities?: string[];
}

export interface DependencyContext {
  dependencies: DependencyInfo[];
  devDependencies: DependencyInfo[];
  categories: DependencyCategories;
}

export interface Architecture {
  structure?: Finding<StructurePattern>;
  boundaries?: Boundary[];
  patterns?: {
    persistence?: Finding<string>;
    error_handling?: Finding<string>;
    dependency_injection?: Finding<string>;
    state_management?: Finding<string>;
  };
  data_flow?: Finding<string>;
  isMonorepo?: Finding<boolean>;
  dependencies?: DependencyContext;
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
