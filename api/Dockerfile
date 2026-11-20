# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props SkolarAid.sln ./
COPY src/SkolarAid.Core/SkolarAid.Core.csproj src/SkolarAid.Core/
COPY src/SkolarAid.Data/SkolarAid.Data.csproj src/SkolarAid.Data/
COPY src/SkolarAid.Api/SkolarAid.Api.csproj src/SkolarAid.Api/
COPY tests/SkolarAid.Tests/SkolarAid.Tests.csproj tests/SkolarAid.Tests/
RUN dotnet restore
COPY . .
RUN dotnet publish src/SkolarAid.Api -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
RUN mkdir -p /app/uploads && chown -R $APP_UID /app/uploads
USER $APP_UID
ENV ASPNETCORE_URLS=http://+:8080 Uploads__Directory=/app/uploads
EXPOSE 8080
ENTRYPOINT ["dotnet", "SkolarAid.Api.dll"]
