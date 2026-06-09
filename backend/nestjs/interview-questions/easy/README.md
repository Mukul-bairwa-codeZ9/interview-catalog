# NestJS Interview Questions — Easy

---

## Q1. What is NestJS and why would you use it over plain Express?

**Answer:**
NestJS is a Node.js framework built on top of Express (or Fastify) that adds structure, opinions, and patterns borrowed from Angular.

Plain Express gives you total freedom — which means no enforced structure. As the app grows, every developer organizes code differently, making it hard to maintain.

NestJS solves this with:
- **Modules** for feature organization
- **Dependency Injection** so you don't manually wire dependencies
- **Decorators** for clean, declarative routing and metadata
- **TypeScript first** — full type safety out of the box
- Built-in support for validation, guards, interceptors, and more

Use NestJS when building enterprise or team-scale backends. Use plain Express for tiny scripts or microservices where overhead isn't worth it.

---

## Q2. What is a Module in NestJS?

**Answer:**
A module is a class decorated with `@Module()` that groups related controllers, providers, and imports together.

Every NestJS app has at least one — the root `AppModule`. Feature modules (like `TasksModule`, `AuthModule`) keep the codebase organized by domain.

The `@Module()` decorator accepts four keys:
- `imports` — other modules this module needs
- `controllers` — route handlers belonging to this module
- `providers` — services and other injectable classes
- `exports` — providers shared with other modules

---

## Q3. What is Dependency Injection and how does NestJS implement it?

**Answer:**
Dependency Injection (DI) means a class receives its dependencies from the outside instead of creating them itself. This makes code loosely coupled and easy to test.

In NestJS:
1. You mark a class as injectable with `@Injectable()`
2. Register it in a module's `providers` array
3. Declare it as a constructor parameter — NestJS injects it automatically

```typescript
@Injectable()
export class TasksService { ... }

// NestJS injects TasksService here:
constructor(private tasksService: TasksService) {}
```

NestJS uses an IoC (Inversion of Control) container that reads TypeScript metadata to resolve and inject the full dependency graph at boot time.

---

## Q4. What is the difference between `@Module` imports and Node.js imports?

**Answer:**
They are completely different things.

- **Node.js `import`** (ES module) — brings a file/package into scope at the JavaScript level. You use this everywhere.
- **`@Module({ imports: [] })`** — tells the NestJS IoC container which other NestJS modules this module depends on, so their exported providers become available for injection.

You will always have both in a NestJS file — the Node.js `import` brings in the class, the `@Module` import wires it into the DI system.

---

## Q5. What does `@Injectable()` do?

**Answer:**
`@Injectable()` is a decorator that marks a class as a **provider** — meaning it can be managed and injected by the NestJS IoC container.

Under the hood, it enables TypeScript's `emitDecoratorMetadata` to store parameter type information, which NestJS uses to know what to inject into the constructor.

Without `@Injectable()`, NestJS cannot inject the class or inject anything into it.

---

## Q6. What is a Controller in NestJS?

**Answer:**
A Controller handles incoming HTTP requests and returns responses. It defines routes using decorators like `@Get()`, `@Post()`, `@Patch()`, `@Delete()`.

Controllers should only handle routing — they delegate actual business logic to services.

```typescript
@Controller('tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  findAll() {
    return this.tasksService.findAll();  // delegate, never put logic here
  }
}
```

---

## Q7. How do you extract data from an incoming request?

**Answer:**
Using parameter decorators:

| Decorator | What it extracts |
|---|---|
| `@Param('id')` | Route parameter (`/tasks/:id`) |
| `@Query('status')` | Query string (`/tasks?status=open`) |
| `@Body()` | Request body |
| `@Headers('auth')` | Specific header |
| `@Req()` | Full Express request object |

```typescript
@Get(':id')
findOne(@Param('id') id: string, @Query('verbose') verbose: string) {}
```

---

## Q8. What is the default scope of a provider in NestJS?

**Answer:**
**Singleton** — NestJS creates one instance of each provider and shares it across the entire application.

This means every controller or service that injects `TasksService` gets the same instance. This is efficient and the correct default for stateless services.

You can change it to `Scope.REQUEST` (new instance per request) or `Scope.TRANSIENT` (new instance per injection) but these are rarely needed.

---

## Q9. What is the difference between `app.useGlobalGuards()` and `APP_GUARD`?

**Answer:**
Both register a global guard, but with an important difference:

- `app.useGlobalGuards(new AuthGuard())` — registered outside the NestJS module system. The guard cannot use Dependency Injection (you can't inject services).
- `providers: [{ provide: APP_GUARD, useClass: AuthGuard }]` — registered inside the module system. The guard is fully managed by the IoC container and **can inject services** (like `JwtService`, `Reflector`).

Always prefer `APP_GUARD` in `AppModule` for global guards in real applications.

---

## Q10. What is `ValidationPipe` and why is it important?

**Answer:**
`ValidationPipe` is a built-in NestJS pipe that validates incoming request data against a DTO (Data Transfer Object) class decorated with `class-validator` decorators.

```typescript
// DTO
export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;
}

// Global setup in main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,              // strips unknown properties
  forbidNonWhitelisted: true,   // throws if unknown props sent
  transform: true,              // auto-converts types
}));
```

It's important because it enforces type safety and input validation at the HTTP boundary, preventing bad data from ever reaching your business logic.