# NestJS Controllers

## What is a Controller?

A **Controller** is responsible for handling incoming HTTP requests and returning responses.

It is the **entry point** for any request into your application.
Controllers define **routes** using decorators and delegate the actual work to **services**.

Think of a controller as a **traffic cop** — it receives requests, reads the route,
and directs them to the right handler. It does NOT contain business logic.

---

## The `@Controller()` Decorator

```typescript
@Controller('tasks')          // base path: /tasks
export class TasksController {

  constructor(private tasksService: TasksService) {}  // DI

  @Get()                      // GET /tasks
  findAll() { ... }

  @Get(':id')                 // GET /tasks/:id
  findOne(@Param('id') id: string) { ... }

  @Post()                     // POST /tasks
  create(@Body() dto: CreateTaskDto) { ... }

  @Patch(':id')               // PATCH /tasks/:id
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) { ... }

  @Delete(':id')              // DELETE /tasks/:id
  remove(@Param('id') id: string) { ... }
}
```

---

## HTTP Method Decorators

| Decorator | HTTP Method | Use case |
|---|---|---|
| `@Get()` | GET | Fetch resource(s) |
| `@Post()` | POST | Create resource |
| `@Put()` | PUT | Replace resource completely |
| `@Patch()` | PATCH | Partial update |
| `@Delete()` | DELETE | Remove resource |
| `@Options()` | OPTIONS | CORS preflight |
| `@Head()` | HEAD | Like GET but no body |
| `@All()` | ALL | Catches any method |

---

## Parameter Decorators

These extract data from the incoming request:

```typescript
@Get(':id')
findOne(
  @Param('id') id: string,           // route param: /tasks/42
  @Query('status') status: string,   // query string: /tasks?status=open
  @Headers('authorization') auth: string, // request header
  @Req() req: Request,               // full Express request object
  @Res() res: Response,              // full Express response object (avoid if possible)
  @Ip() ip: string,                  // client IP
) {}

@Post()
create(
  @Body() dto: CreateTaskDto,        // full request body
  @Body('title') title: string,      // single field from body
) {}
```

> **Interview note:** Using `@Res()` bypasses NestJS response handling (interceptors, etc.).
> Only use it when you genuinely need Express-level control.

---

## Route Wildcards and Versioning

```typescript
@Get('ab*cd')         // matches abcd, ab_cd, abecd — wildcard
@Get('docs/:version') // /docs/v1, /docs/v2

// API Versioning
@Controller({ path: 'tasks', version: '1' })  // /v1/tasks
```

---

## Response Handling

### Default (recommended)
NestJS serializes the return value automatically:
- Return an object → JSON response, 200 OK
- Return nothing → 204 No Content
- Throw an exception → NestJS exception filter handles it

```typescript
@Get()
findAll(): Task[] {
  return this.tasksService.findAll();  // NestJS sends as JSON, 200
}
```

### Custom Status Code
```typescript
@Post()
@HttpCode(201)           // override default status
create(@Body() dto: CreateTaskDto) {
  return this.tasksService.create(dto);
}
```

### Custom Headers
```typescript
@Get()
@Header('Cache-Control', 'no-cache')
findAll() { ... }
```

### Redirect
```typescript
@Get('docs')
@Redirect('https://docs.nestjs.com', 301)
getDocs() {}
```

---

## Async Controllers

NestJS fully supports async/await and Observables:

```typescript
@Get()
async findAll(): Promise<Task[]> {
  return this.tasksService.findAll();  // awaited automatically
}

// RxJS Observable also works (used with @nestjs/microservices)
@Get()
findAll(): Observable<Task[]> {
  return from(this.tasksService.findAll());
}
```

---

## Controller Scope

By default all controllers are **request-scoped at the module level** (singleton).
You can change this:

```typescript
@Controller({ path: 'tasks', scope: Scope.REQUEST })
// New instance per request — rarely needed, impacts performance
```

---

## Where Controllers Live in the Request Lifecycle

```
Incoming Request
    ↓
Middleware          (runs first, e.g. logging)
    ↓
Guards             (can block the request, e.g. auth)
    ↓
Interceptors       (before handler — e.g. transform input)
    ↓
Pipes              (validate/transform params & body)
    ↓
→ Controller Handler ← YOU ARE HERE
    ↓
Interceptors       (after handler — e.g. transform output)
    ↓
Exception Filters  (catches any thrown errors)
    ↓
Response sent
```

---

## Key Interview Points

- Controllers handle routing only — business logic belongs in services
- `@Param`, `@Query`, `@Body`, `@Headers` are the main data extractors
- Avoid `@Res()` unless absolutely needed — it breaks interceptors and response handling
- Return values are automatically serialized to JSON
- Controllers must be registered in a module's `controllers` array to be active
- HTTP method decorators accept optional path: `@Get('active')` → `/tasks/active`