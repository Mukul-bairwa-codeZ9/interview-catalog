# NestJS Interview Questions — Advanced

---

## Q1. How does the NestJS IoC container resolve the dependency graph? What happens with circular dependencies?

**Answer:**
At boot, NestJS scans module metadata, reads constructor parameter types via TypeScript's `reflect-metadata`, and builds a directed dependency graph. It then performs a topological sort to determine initialization order — providers with no dependencies are instantiated first, then those that depend on them, and so on.

**Circular dependencies** (A → B → A) cause NestJS to throw at startup because neither can be instantiated first.

Resolution: use `forwardRef()` to break the cycle:

```typescript
// A injects B
constructor(@Inject(forwardRef(() => BService)) private b: BService) {}

// B injects A
constructor(@Inject(forwardRef(() => AService)) private a: AService) {}
```

`forwardRef()` returns a lazy reference — a function that resolves to the class after it's been defined. NestJS handles the circular instantiation internally.

**Important interview note:** Circular dependencies are usually a design smell. Prefer extracting shared logic into a third service that both A and B depend on.

---

## Q2. Explain `Scope.REQUEST` and its cascading effect. When is it actually appropriate?

**Answer:**
`Scope.REQUEST` creates a new provider instance for every HTTP request and destroys it after the response is sent.

**Cascading:** If Service A is `REQUEST` scoped and Service B injects A, then B also becomes `REQUEST` scoped automatically — the scope propagates up the dependency chain.

```typescript
@Injectable({ scope: Scope.REQUEST })
export class RequestContextService {
  private readonly requestId = uuid();
}
```

**Performance impact:** Every request triggers instantiation of the provider and all providers that depend on it. This is significantly more expensive than singletons.

**Appropriate use cases:**
- Per-request context (tenant ID, request ID for tracing)
- Request-specific logging correlation
- Accessing `REQUEST` object inside a service without passing it as a parameter

**Pattern:** Use a `REQUEST` scoped service only at the leaf of the dependency tree, and keep it small. Never make a heavy service (like DB service) `REQUEST` scoped.

---

## Q3. How would you implement a global response transformation interceptor? What are the edge cases?

**Answer:**
```typescript
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }))
    );
  }
}
```

**Edge cases to mention in an interview:**

1. **File downloads / streaming responses:** Wrapping a file stream in `{ success, data }` breaks it. Solution: use a custom decorator `@SkipTransform()` and check for it in the interceptor via `Reflector`.

2. **Pagination:** If the service already returns `{ items, total, page }`, wrapping it adds an extra layer. Plan your response shape from the start.

3. **`@Res()` used in controller:** The interceptor won't run for `@Res()` responses unless you add `passthrough: true` to the decorator.

4. **Exception responses:** Exceptions bypass `map` — they go straight to the exception filter. Your `{ success: false }` shape needs to be applied in the filter, not the interceptor.

---

## Q4. How do you implement multi-tenant architecture in NestJS?

**Answer:**
The common approach uses `REQUEST` scoped services combined with a middleware or guard to extract tenant context.

```typescript
// 1. Middleware extracts tenant from subdomain or header
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'] as string;
    req['tenantId'] = tenantId;
    next();
  }
}

// 2. REQUEST scoped service holds tenant context
@Injectable({ scope: Scope.REQUEST })
export class TenantService {
  constructor(@Inject(REQUEST) private req: Request) {}

  getTenantId(): string {
    return this.req['tenantId'];
  }
}

// 3. Data service injects TenantService — also becomes REQUEST scoped
@Injectable()
export class TasksService {
  constructor(private tenantService: TenantService) {}

  findAll() {
    const tenantId = this.tenantService.getTenantId();
    return this.db.tasks.find({ tenantId });
  }
}
```

The `REQUEST` injection token (`@Inject(REQUEST)`) lets you directly inject the request object into any `REQUEST` scoped provider.

---

## Q5. How do you avoid `APP_GUARD` applying to public routes?

**Answer:**
The standard pattern uses a `@Public()` decorator and checks for it inside the guard using `Reflector`:

```typescript
// 1. Define the decorator
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// 2. Use it on routes that should skip auth
@Get('health')
@Public()
healthCheck() { return 'ok'; }

// 3. Check it in the global guard
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),  // check method first
      context.getClass(),    // then class
    ]);
    if (isPublic) return true;

    // proceed with JWT verification...
  }
}
```

`getAllAndOverride` checks method-level metadata first, then class-level — this lets you mark a whole controller public and override individual methods.

---

## Q6. How do you implement caching using an interceptor in NestJS?

**Answer:**
```typescript
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private cache = new Map<string, any>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const key = request.url;

    if (this.cache.has(key)) {
      return of(this.cache.get(key));   // short-circuit — don't call handler
    }

    return next.handle().pipe(
      tap(data => this.cache.set(key, data))   // store in cache after handler runs
    );
  }
}
```

Key point: `return of(cachedValue)` returns an Observable that emits the cached value immediately **without calling `next.handle()`** — the handler is never executed. This is a unique power of interceptors.

In production, you'd use `@nestjs/cache-manager` with Redis and TTL instead of an in-memory Map.

---

## Q7. What is the difference between `ExceptionFilter` bound at route, controller, and global level, and which takes precedence?

**Answer:**
Exception filters follow the same scope hierarchy as guards and interceptors:

```
Global filter → Controller filter → Route filter
```

But the **precedence is inverted for exception handling** — the **most specific** (innermost) filter catches the exception first. If it doesn't rethrow, the outer filters don't run.

```typescript
@Get(':id')
@UseFilters(RouteSpecificFilter)   // ← catches first
findOne() {
  throw new NotFoundException();
}
// ControllerFilter and GlobalFilter never see this exception
```

Practical rule: use one global filter for all HTTP exceptions and only add route-level filters for special cases (e.g., a file upload route needs to handle `MulterError`).

---

## Q8. How would you implement structured logging that includes the request ID in every log line?

**Answer:**
The pattern combines `REQUEST` scoped service + `AsyncLocalStorage` (Node.js built-in):

```typescript
// 1. Create a request context using AsyncLocalStorage (no scope issues)
const asyncLocalStorage = new AsyncLocalStorage<{ requestId: string }>();

// 2. Middleware sets the context
app.use((req, res, next) => {
  asyncLocalStorage.run({ requestId: uuid() }, next);
});

// 3. Logger reads from context — works in any scope (singleton safe)
@Injectable()
export class AppLogger {
  log(message: string) {
    const store = asyncLocalStorage.getStore();
    console.log(JSON.stringify({
      requestId: store?.requestId,
      message,
      timestamp: new Date().toISOString(),
    }));
  }
}
```

This is better than `Scope.REQUEST` for the logger because `AsyncLocalStorage` propagates through async boundaries automatically and the logger stays singleton-scoped (no performance cost).

---

## Q9. How does NestJS handle exceptions thrown inside an interceptor vs inside a handler?

**Answer:**
**Exception thrown in handler:**
```
Handler throws → Interceptor's post-handler code skipped → Exception Filter catches it
```

**Exception thrown in interceptor (post-handler via catchError):**
```typescript
return next.handle().pipe(
  catchError(err => {
    // Interceptor catches the handler's error
    // Can rethrow a different error or return fallback data
    throw new HttpException('Custom error', 500);
  })
);
```

**Exception thrown in interceptor (pre-handler):**
```
Interceptor throws before next.handle() → Handler never runs → Exception Filter catches the interceptor's error
```

The exception filter is always the final safety net, regardless of where the exception originates. This is why having a global `@Catch()` filter in production is essential.

---

## Q10. What is `APP_PIPE`, `APP_GUARD`, `APP_INTERCEPTOR`, `APP_FILTER` and why are they preferred over `app.useGlobal*()`?

**Answer:**
These are special injection tokens from `@nestjs/core` that register global pipes, guards, interceptors, and filters through the NestJS module system.

```typescript
// AppModule providers:
providers: [
  { provide: APP_GUARD,       useClass: JwtAuthGuard },
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  { provide: APP_PIPE,        useClass: ValidationPipe },
  { provide: APP_FILTER,      useClass: AllExceptionsFilter },
]
```

**Why prefer them over `app.useGlobalGuards()` etc.:**

1. **Dependency Injection** — guards/interceptors registered this way are instantiated by the IoC container, so they can inject other services (e.g., `JwtAuthGuard` needs `JwtService`, `Reflector`).
2. **Module boundary** — they live inside the module system, making the setup explicit and testable.
3. `app.useGlobal*()` creates instances outside the DI container — `new AuthGuard()` — so constructor injection doesn't work.

In any real application, always use `APP_*` tokens.