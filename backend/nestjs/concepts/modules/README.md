# NestJS Modules

## What is a Module?

A **Module** is the fundamental building block of a NestJS application.
Every NestJS app has at least one module — the **Root Module** (`AppModule`).

Think of a module as a **box** that groups related things together:
- Controllers (handle requests)
- Providers/Services (business logic)
- Other imported modules

NestJS uses modules to organize your app into **feature slices**, just like how you'd
organize a codebase into folders — but with explicit wiring so NestJS knows what
depends on what.

---

## The `@Module()` Decorator

Every module is a class decorated with `@Module()`.

```typescript
@Module({
  imports: [],      // other modules this module needs
  controllers: [],  // controllers that belong to this module
  providers: [],    // services/providers available in this module
  exports: [],      // providers this module shares with other modules
})
export class TasksModule {}
```

### The 4 keys explained:

| Key | What it does | Analogy |
|---|---|---|
| `imports` | Pulls in another module's exported providers | "I need what that team built" |
| `controllers` | Registers route handlers for this module | "These people answer the phone" |
| `providers` | Registers services, DI tokens, factories | "These people do the actual work" |
| `exports` | Makes providers available to other modules | "I'm sharing this with others" |

---

## Types of Modules

### 1. Root Module (`AppModule`)
- The entry point. NestJS boots from here.
- Imports all feature modules.

```typescript
// app.module.ts
@Module({
  imports: [TasksModule, UsersModule],
})
export class AppModule {}
```

### 2. Feature Module
- Groups one feature (e.g., Tasks, Auth, Users).
- Self-contained — has its own controllers, services.

```typescript
// tasks.module.ts
@Module({
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
```

### 3. Shared Module
- A module whose providers are reused across multiple modules.
- Export the provider and import the module wherever needed.

```typescript
// database.module.ts
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],   // <-- this makes it shareable
})
export class DatabaseModule {}
```

```typescript
// tasks.module.ts
@Module({
  imports: [DatabaseModule],    // <-- now TasksService can inject DatabaseService
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
```

### 4. Global Module
- Decorated with `@Global()`.
- Its exports are available everywhere without importing the module.
- Use sparingly — only for truly app-wide things like config or logging.

```typescript
@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
```

### 5. Dynamic Module
- A module that is configured at runtime (accepts options).
- Common pattern for libraries like `TypeOrmModule.forRoot(options)`.

```typescript
@Module({})
export class DatabaseModule {
  static forRoot(options: DbOptions): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: 'DB_OPTIONS', useValue: options }],
      exports: ['DB_OPTIONS'],
    };
  }
}

// usage
DatabaseModule.forRoot({ host: 'localhost', port: 5432 })
```

---

## Module Encapsulation

This is critical to understand for interviews.

> **By default, a provider is only visible inside the module it is declared in.**

If `TasksService` is in `TasksModule` and `UsersModule` needs it:
- ❌ Just injecting it won't work — NestJS will throw a dependency error
- ✅ `TasksModule` must `export` `TasksService`, and `UsersModule` must `import` `TasksModule`

```typescript
// TasksModule exports TasksService
@Module({
  providers: [TasksService],
  exports: [TasksService],      // step 1: export it
})
export class TasksModule {}

// UsersModule imports TasksModule
@Module({
  imports: [TasksModule],       // step 2: import the module (not the service directly)
  providers: [UsersService],
})
export class UsersModule {}
```

---

## Module Initialization Order

NestJS builds a **dependency graph** and initializes modules in the correct order.

```
AppModule
  └── TasksModule      ← initialized first (no deps)
  └── AuthModule
        └── UsersModule  ← initialized before AuthModule
```

This means you never manually `new` a service — NestJS handles instantiation order.

---

## Key Interview Points

- Every NestJS app needs exactly one root module
- Modules are **singletons** by default — the same instance is shared across the app
- `exports` + `imports` is the only way to share providers across modules
- `@Global()` skips the import requirement but should be used sparingly
- Dynamic modules (`.forRoot()`, `.forFeature()`) are how libraries accept configuration
- NestJS module system is inspired by Angular's NgModule